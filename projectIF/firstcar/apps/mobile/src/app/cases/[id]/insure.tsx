import { OWNERSHIP_NOTIFICATION_DAYS, eur, formatEur, type AgeBand, type CoverIntent } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';
import { useState } from 'react';

import { bindPolicy, fileOwnershipChange, requestQuote } from '@/adapters';
import { useCaseId } from '@/hooks/use-case-id';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { caseTitle, formatDate } from '@/ui/case-helpers';
import { CaseProgress } from '@/ui/case-steps';
import { IconLine } from '@/ui/icon';
import { InsuredCard } from '@/ui/insured-card';
import { Button, Card, Choice, Row, Screen, Section, Txt } from '@/ui/primitives';
import { DemoBadge } from '@/ui/status';

/**
 * The purchase steps are finished, so they leave the history: back from My Car goes straight Home.
 * dismissTo('/') pops to Home, or replaces this screen with Home when there is no history (web reload).
 */
function openMyCar() {
  router.dismissTo('/');
  router.push('/own');
}

export default function Insure() {
  const c = useCase(useCaseId());
  const { t, prefs } = useSession();
  const { data, caseEvent, getCase } = useStore();
  const p = usePalette();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Asked inline when there is no budget profile: only the fields the quote needs, no defaults.
  const [quick, setQuick] = useState<{ ageBand?: AgeBand; firstCar?: boolean; cover?: CoverIntent; deductible?: number }>({});
  if (!c) return <Redirect href="/" />;

  const profile = data.profile;
  // No invented defaults: without the buyer's own answers there is nothing to consent to.
  const buyer = profile
    ? { ageBand: profile.ageBand, firstTimeDriver: profile.firstTimeDriver, coverIntent: profile.coverIntent, deductible: profile.deductible }
    : quick.ageBand && quick.firstCar !== undefined && quick.cover && quick.deductible
      ? { ageBand: quick.ageBand, firstTimeDriver: quick.firstCar, coverIntent: quick.cover, deductible: eur(quick.deductible) }
      : undefined;
  const h = c.handoff;
  const boughtAt = c.decision?.kind === 'buy' ? c.decision.at : undefined;
  // From the moment the car is bought, not only after a quote.
  const deadline = h?.ownershipNotificationBy ?? (boughtAt ? new Date(Date.parse(boughtAt) + OWNERSHIP_NOTIFICATION_DAYS * 86_400_000).toISOString() : undefined);

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
      if (!buyer) return 'profile_missing';
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
    else openMyCar();
  };

  return (
    <Screen top={<CaseProgress c={c} current="insure" t={t} />}>
      <Stack.Screen options={{ title: t('insure.title') }} />
      <Card tone="warning">
        <Txt variant="h2">{t('insure.mandatory')}</Txt>
        {deadline ? <Txt variant="bodyStrong">{t('insure.deadline', { date: formatDate(deadline, prefs.locale) })}</Txt> : null}
      </Card>
      <Card>
        <Txt variant="bodyStrong">{t('insure.howToTitle')}</Txt>
        <Txt variant="small">{t('insure.howTo')}</Txt>
      </Card>
      <Txt variant="small">{t('insure.neutral')}</Txt>
      <DemoBadge t={t} />

      {buyer ? (
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
          <IconLine icon="lock" variant="bodyStrong" color={p.success}>
            {t('insure.notShared')}
          </IconLine>
        </Section>
      ) : null}

      {error ? <Txt color={p.danger}>{error}</Txt> : null}

      {c.status === 'bought' && !profile ? (
        <Section title={t('insure.quickTitle')}>
          <Card>
            <Txt variant="small">{t('ready.age')}</Txt>
            <Choice label={t('ready.age')} value={quick.ageBand} onChange={(ageBand) => setQuick((q) => ({ ...q, ageBand }))} options={(['18-19', '20-25', '26-34', '35+'] as const).map((a) => ({ value: a, label: a }))} />
            <Txt variant="small">{t('ready.firstTime')}</Txt>
            <Choice
              label={t('ready.firstTime')}
              value={quick.firstCar}
              onChange={(firstCar) => setQuick((q) => ({ ...q, firstCar }))}
              options={[
                { value: true, label: t('common.yes') },
                { value: false, label: t('common.no') },
              ]}
            />
            <Txt variant="small">{t('ready.cover')}</Txt>
            <Choice
              label={t('ready.cover')}
              value={quick.cover}
              onChange={(cover) => setQuick((q) => ({ ...q, cover }))}
              options={(['liability_only', 'liability_plus_partial', 'liability_plus_comprehensive'] as const).map((x) => ({ value: x, label: t(`cover.${x}`) }))}
            />
            <Txt variant="small">{t('ready.deductible')}</Txt>
            <Choice label={t('ready.deductible')} value={quick.deductible} onChange={(deductible) => setQuick((q) => ({ ...q, deductible }))} options={[150, 300, 500].map((d) => ({ value: d, label: `${d} €` }))} />
          </Card>
          <Button kind="ghost" label={t('insure.orFull')} onPress={() => router.push({ pathname: '/ready', params: { from: 'insure', caseId: c.id } })} />
        </Section>
      ) : null}
      {c.status === 'bought' && buyer ? <Button label={t('insure.consent')} onPress={consent} loading={busy} /> : null}
      {h?.status === 'quote_received' && h.quoteMonthly ? (
        <Card tone="info">
          <Txt variant="h2">{t('insure.quote', { amount: formatEur(h.quoteMonthly) })}</Txt>
          <Button label={t('insure.bind')} onPress={bind} loading={busy} />
        </Card>
      ) : null}
      <InsuredCard c={c} />
      {h?.status === 'bound' ? <Button label={t('insure.register')} onPress={register} loading={busy} /> : null}
      {c.status === 'registered' || c.status === 'owned' ? (
        <Card tone="success">
          <IconLine icon="check" variant="bodyStrong">{t('insure.done')}</IconLine>
          {c.status === 'registered' ? <Button label={t('insure.toOwn')} onPress={own} /> : <Button label={t('insure.toOwn')} onPress={openMyCar} />}
        </Card>
      ) : null}
    </Screen>
  );
}
