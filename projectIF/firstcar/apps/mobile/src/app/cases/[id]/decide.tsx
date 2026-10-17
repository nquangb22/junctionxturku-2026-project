import { beltDueCost, computeBudget, evaluateGate, formatEur, isStale, itemTitle, renderFinding, type GateBlocker, type VerificationItem } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { VERDICT_TONE } from '@/constants/theme';
import { useCaseId } from '@/hooks/use-case-id';
import { usePalette } from '@/hooks/use-palette';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { carForCase } from '@/ui/case-helpers';
import { confirmAction } from '@/ui/dialog';
import { IconLine } from '@/ui/icon';
import { Badge, Button, Card, NavCard, Screen, Section, Txt } from '@/ui/primitives';

export default function Decide() {
  const c = useCase(useCaseId());
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
  const accepted = c.items.filter((i) => i.acceptedRisk);
  const due = c.items.filter(isStale);
  const unchecked = c.items.filter((i) => i.criticality !== 'critical' && i.status === 'unchecked').length;
  const openItem = (i: VerificationItem) => router.push({ pathname: '/cases/[id]/item/[itemId]', params: { id: c.id, itemId: i.id } });

  const confirmBuy = () =>
    confirmAction({
      title: t('decide.buy'),
      message: t('decide.buyConfirm'),
      confirmLabel: t('decide.buy'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => act({ type: 'buy' }, () => router.push({ pathname: '/cases/[id]/insure', params: { id: c.id } })),
    });
  const confirmWalkAway = () =>
    confirmAction({
      title: t('case.walkAway'),
      message: t('case.walkAwayConfirm'),
      confirmLabel: t('case.walkAway'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => act({ type: 'walk_away' }, () => router.dismissTo('/')),
    });

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
          <IconLine icon="check" variant="title">{t('decide.ready')}</IconLine>
        </Card>
      ) : (
        <Section title={t('decide.blocked')}>
          {gate.blockers.map((b) => (
            <Card key={`${b.kind}-${b.itemId}`} tone={b.kind === 'red_flag' || b.kind === 'contradiction' ? 'danger' : 'warning'}>
              <Pressable
                accessibilityRole="button"
                style={styles.blocker}
                onPress={() => router.push({ pathname: '/cases/[id]/item/[itemId]', params: { id: c.id, itemId: b.itemId } })}>
                <Txt variant="bodyStrong">
                  {t(`decide.blocker.${b.kind}`, { item: title(b) })} ›
                </Txt>
              </Pressable>
            </Card>
          ))}
        </Section>
      )}

      {!bought && accepted.length ? (
        <Section title={t('decide.acceptedTitle')}>
          {accepted.map((i) => (
            <NavCard key={i.id} title={itemTitle(i, prefs.locale)} tone="warning" onPress={() => openItem(i)} />
          ))}
        </Section>
      ) : null}
      {!bought && due.length ? (
        <Section title={t('decide.dueTitle')}>
          {due.map((i) => (
            <NavCard
              key={i.id}
              title={itemTitle(i, prefs.locale)}
              subtitle={i.findings.filter((f) => f.kind === 'stale').map((f) => renderFinding(f, prefs.locale)).join(' ')}
              onPress={() => openItem(i)}
            />
          ))}
          {budget ? <Txt variant="small">{t('decide.dueBudget', { amount: formatEur(budget.monthlyTotal) })}</Txt> : null}
        </Section>
      ) : null}
      {!bought && unchecked ? (
        <NavCard
          title={t(unchecked === 1 ? 'decide.unchecked.one' : 'decide.unchecked.other', { n: unchecked })}
          onPress={() => router.push({ pathname: '/cases/[id]/ledger', params: { id: c.id } })}
        />
      ) : null}

      {error ? <Txt color={p.danger}>{error}</Txt> : null}

      {c.status === 'contract_prep' ? (
        <Button label={t('decide.markReady')} disabled={!gate.passes} onPress={() => act({ type: 'mark_ready' })} />
      ) : null}
      {c.status === 'ready_to_buy' ? (
        <>
          <Badge tone="success" label={t('caseStatus.ready_to_buy')} />
          <Button label={t('decide.buy')} onPress={confirmBuy} />
        </>
      ) : null}
      {!bought && c.status !== 'contract_prep' && c.status !== 'ready_to_buy' ? <Txt variant="small">{t('decide.notInStep')}</Txt> : null}
      {!bought && c.status !== 'walked_away' ? (
        <Button kind="ghost" label={t('case.walkAway')} onPress={confirmWalkAway} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  blocker: { minHeight: 48, justifyContent: 'center' },
});
