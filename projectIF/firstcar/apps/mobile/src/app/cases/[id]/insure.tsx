import { eur, formatEur } from '@firstcar/core';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { bindPolicy, fileOwnershipChange, requestQuote } from '@/adapters';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { caseTitle, formatDate } from '@/ui/case-helpers';
import { Button, Card, Row, Screen, Section, Txt } from '@/ui/primitives';
import { DemoBadge } from '@/ui/status';

export default function Insure() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCase(id);
  const { t, prefs } = useSession();
  const { data, caseEvent, getCase } = useStore();
  const p = usePalette();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!c) return <Redirect href="/" />;

  const profile = data.profile;
  const buyer = {
    ageBand: profile?.ageBand ?? '20-25',
    firstTimeDriver: profile?.firstTimeDriver ?? true,
    coverIntent: profile?.coverIntent ?? 'liability_plus_partial',
    deductible: profile?.deductible ?? eur(300),
  } as const;
  const h = c.handoff;

  const step = async (fn: () => Promise<string | undefined>) => {
    setBusy(true);
    setError(undefined);
    try {
      const err = await fn();
      if (err) setError(t('common.error', { error: err }));
    } catch (e) {
      setError(t('common.error', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const consent = () =>
    step(async () => {
      const err = caseEvent(c.id, { type: 'handoff_consented', buyer });
      if (err) return err;
      // Only the consented payload goes to the insurer adapter.
      const payload = getCase(c.id)?.handoff?.payload;
      if (!payload) return 'handoff_missing';
      return caseEvent(c.id, { type: 'handoff_quote', monthly: await requestQuote(payload) });
    });

  const bind = () =>
    step(async () => {
      await bindPolicy();
      return caseEvent(c.id, { type: 'handoff_bound' });
    });

  const register = () =>
    step(async () => {
      await fileOwnershipChange();
      return caseEvent(c.id, { type: 'registered' });
    });

  const own = () => {
    const err = caseEvent(c.id, { type: 'take_ownership' });
    if (err) setError(t('common.error', { error: err }));
    else router.replace('/own');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('insure.title') }} />
      <Card tone="warning">
        <Txt variant="h2">{t('insure.mandatory')}</Txt>
        {h ? <Txt variant="bodyStrong">{t('insure.deadline', { date: formatDate(h.ownershipNotificationBy, prefs.locale) })}</Txt> : null}
      </Card>
      <Txt variant="small">{t('insure.neutral')}</Txt>
      <DemoBadge t={t} />

      <Section title={t('insure.payloadTitle')}>
        <Card>
          <Row label={t('payload.car')} value={caseTitle(c)} />
          <Row label={t('payload.plate')} value={c.registry?.plate ?? c.listing.plateLocal ?? '—'} />
          <Row label={t('payload.purchaseDate')} value={(c.decision?.at ?? new Date().toISOString()).slice(0, 10)} />
          <Row label={t('payload.ageBand')} value={buyer.ageBand} />
          <Row label={t('payload.firstTime')} value={buyer.firstTimeDriver ? t('common.yes') : t('common.no')} />
          <Row label={t('payload.cover')} value={t(`cover.${buyer.coverIntent}`)} />
          <Row label={t('payload.deductible')} value={formatEur(buyer.deductible)} />
        </Card>
        <Txt variant="bodyStrong" color={p.success}>
          🔒 {t('insure.notShared')}
        </Txt>
      </Section>

      {error ? <Txt color={p.danger}>{error}</Txt> : null}

      {c.status === 'bought' ? <Button label={t('insure.consent')} onPress={consent} loading={busy} /> : null}
      {h?.status === 'quote_received' && h.quoteMonthly ? (
        <Card tone="info">
          <Txt variant="h2">{t('insure.quote', { amount: formatEur(h.quoteMonthly) })}</Txt>
          <Button label={t('insure.bind')} onPress={bind} loading={busy} />
        </Card>
      ) : null}
      {h?.status === 'bound' ? <Button label={t('insure.register')} onPress={register} loading={busy} /> : null}
      {c.status === 'registered' || c.status === 'owned' ? (
        <Card tone="success">
          <Txt variant="bodyStrong">✓ {t('insure.done')}</Txt>
          {c.status === 'registered' ? <Button label={t('insure.toOwn')} onPress={own} /> : <Button label={t('insure.toOwn')} onPress={() => router.replace('/own')} />}
        </Card>
      ) : null}
    </Screen>
  );
}
