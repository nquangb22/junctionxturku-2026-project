import { beltDueCost, computeBudget, evaluateGate, formatEur, itemTitle, type GateBlocker } from '@firstcar/core';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { VERDICT_TONE } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { carForCase } from '@/ui/case-helpers';
import { Badge, Button, Card, Screen, Section, Txt } from '@/ui/primitives';

export default function Decide() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCase(id);
  const { t, prefs } = useSession();
  const { data, caseEvent } = useStore();
  const p = usePalette();
  const [error, setError] = useState<string | undefined>();
  if (!c) return <Redirect href="/" />;

  const gate = evaluateGate(c);
  const car = carForCase(c);
  const budget = data.profile && car ? computeBudget({ profile: data.profile, car, extraOneOffEur: beltDueCost(c), now: new Date() }) : undefined;
  const title = (b: GateBlocker) => {
    const item = c.items.find((i) => i.id === b.itemId);
    return item ? itemTitle(item, prefs.locale) : b.itemId;
  };

  const act = (event: Parameters<typeof caseEvent>[1], then?: () => void) => {
    const err = caseEvent(c.id, event);
    if (err) setError(t('common.error', { error: err }));
    else then?.();
  };

  const bought = ['bought', 'insuring', 'registered', 'owned'].includes(c.status);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('decide.title') }} />

      {budget ? (
        <Card tone={VERDICT_TONE[budget.verdict.level]}>
          <Txt variant="bodyStrong">{t('decide.budget', { amount: formatEur(budget.monthlyTotal), verdict: t(`verdict.${budget.verdict.level}`) })}</Txt>
          {budget.buffer.oneOffs.minor > 0 ? <Txt variant="small">{t('result.oneOff', { amount: formatEur(budget.buffer.oneOffs) })}</Txt> : null}
        </Card>
      ) : null}

      {bought ? (
        <Card tone="warning">
          <Txt variant="h2">{t('insure.mandatory')}</Txt>
          <Button label={t('case.step.insure')} onPress={() => router.push({ pathname: '/cases/[id]/insure', params: { id: c.id } })} />
        </Card>
      ) : gate.passes ? (
        <Card tone="success">
          <Txt variant="title">✓ {t('decide.ready', { n: gate.acceptedRisks })}</Txt>
          {gate.staleWarnings ? <Txt>{t('decide.stale', { n: gate.staleWarnings })}</Txt> : null}
        </Card>
      ) : (
        <Section title={t('decide.blocked')}>
          {gate.blockers.map((b) => (
            <Card key={`${b.kind}-${b.itemId}`} tone={b.kind === 'red_flag' || b.kind === 'contradiction' ? 'danger' : 'warning'}>
              <Txt
                variant="bodyStrong"
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/cases/[id]/item/[itemId]', params: { id: c.id, itemId: b.itemId } })}>
                {t(`decide.blocker.${b.kind}`, { item: title(b) })} ›
              </Txt>
            </Card>
          ))}
        </Section>
      )}

      {error ? <Txt color={p.danger}>{error}</Txt> : null}

      {c.status === 'contract_prep' ? (
        <Button label={t('decide.markReady')} disabled={!gate.passes} onPress={() => act({ type: 'mark_ready' })} />
      ) : null}
      {c.status === 'ready_to_buy' ? (
        <>
          <Badge tone="success" label={t('caseStatus.ready_to_buy')} />
          <Button label={t('decide.buy')} onPress={() => act({ type: 'buy' }, () => router.push({ pathname: '/cases/[id]/insure', params: { id: c.id } }))} />
        </>
      ) : null}
      {!bought && c.status !== 'contract_prep' && c.status !== 'ready_to_buy' ? <Txt variant="small">{t('decide.notInStep')}</Txt> : null}
      {!bought && c.status !== 'walked_away' ? (
        <Button kind="ghost" label={t('case.walkAway')} onPress={() => act({ type: 'walk_away' }, () => router.replace('/'))} />
      ) : null}
    </Screen>
  );
}
