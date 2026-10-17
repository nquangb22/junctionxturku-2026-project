import { Redirect, Stack, router } from 'expo-router';
import { View } from 'react-native';

import { useCaseId } from '@/hooks/use-case-id';
import { Spacing } from '@/constants/theme';
import type { MessageKey } from '@/i18n';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { caseCounts, caseTitle } from '@/ui/case-helpers';
import { confirmAction, notify } from '@/ui/dialog';
import { Badge, Button, NavCard, Screen, Section, Txt } from '@/ui/primitives';

type StepKey = 'claims' | 'registry' | 'ledger' | 'inspection' | 'contract' | 'decide' | 'insure';

const STEPS: { key: StepKey; label: MessageKey; pathname: `/cases/[id]/${StepKey}` }[] = [
  { key: 'claims', label: 'case.step.claims', pathname: '/cases/[id]/claims' },
  { key: 'registry', label: 'case.step.registry', pathname: '/cases/[id]/registry' },
  { key: 'ledger', label: 'case.step.ledger', pathname: '/cases/[id]/ledger' },
  { key: 'inspection', label: 'case.step.inspection', pathname: '/cases/[id]/inspection' },
  { key: 'contract', label: 'case.step.contract', pathname: '/cases/[id]/contract' },
  { key: 'decide', label: 'case.step.decide', pathname: '/cases/[id]/decide' },
  { key: 'insure', label: 'case.step.insure', pathname: '/cases/[id]/insure' },
];

const AFTER_PURCHASE = new Set(['bought', 'insuring', 'registered', 'owned', 'closed']);
const CONTRACT_OR_LATER = new Set(['contract_prep', 'ready_to_buy', ...AFTER_PURCHASE]);

export default function CaseOverview() {
  const c = useCase(useCaseId());
  const { t } = useSession();
  const { caseEvent, deleteCase } = useStore();

  if (!c) return <Redirect href="/" />;
  const counts = caseCounts(c);
  const confirmed = c.items.length > 0;

  const enabled: Record<StepKey, boolean> = {
    claims: true,
    registry: confirmed,
    ledger: confirmed,
    inspection: !!c.registry,
    contract: CONTRACT_OR_LATER.has(c.status),
    decide: CONTRACT_OR_LATER.has(c.status),
    insure: AFTER_PURCHASE.has(c.status),
  };
  // Shown under a locked step and on tap, so a locked row is never a silent no-op.
  const lockReason: Record<StepKey, MessageKey> = {
    claims: 'case.locked.claims',
    registry: 'case.locked.claims',
    ledger: 'case.locked.claims',
    inspection: 'case.locked.registry',
    contract: 'case.locked.inspection',
    decide: 'case.locked.inspection',
    insure: 'case.locked.insure',
  };
  // Started but not done: shown as "In progress" so every step has exactly one status.
  const started: Record<StepKey, boolean> = {
    claims: c.status === 'reviewing_claims',
    registry: false,
    ledger: c.items.some((i) => i.status !== 'unchecked' || i.questionAsked || i.acceptedRisk),
    inspection: c.status === 'inspecting' || c.testDriveDone || c.inspectionDone || !!c.inspectionBooking,
    contract: c.status === 'contract_prep',
    decide: c.status === 'ready_to_buy',
    insure: c.status === 'bought' || c.status === 'insuring' || c.status === 'registered',
  };
  const stepStatus = (k: StepKey) =>
    done[k] ? '✓' : !enabled[k] ? `— · ${t(lockReason[k])}` : started[k] ? t('case.inProgress') : '—';
  const done: Record<StepKey, boolean> = {
    claims: confirmed,
    registry: !!c.registry,
    ledger: confirmed && counts.open === 0,
    inspection: c.testDriveDone,
    contract: CONTRACT_OR_LATER.has(c.status) && c.status !== 'contract_prep',
    decide: AFTER_PURCHASE.has(c.status),
    insure: c.status === 'owned' || c.status === 'registered',
  };

  const confirmDelete = () =>
    confirmAction({
      title: t('case.delete'),
      message: t('case.deleteConfirm'),
      confirmLabel: t('case.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: () => {
        deleteCase(c.id);
        router.replace('/');
      },
    });

  const confirmWalkAway = () =>
    confirmAction({
      title: t('case.walkAway'),
      message: t('case.walkAwayConfirm'),
      confirmLabel: t('case.walkAway'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => caseEvent(c.id, { type: 'walk_away' }),
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: caseTitle(c) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        <Badge tone={c.status === 'walked_away' ? 'neutral' : 'info'} label={t(`caseStatus.${c.status}`)} />
        {confirmed ? <Badge tone={counts.problems ? 'danger' : 'neutral'} label={t('case.summary', counts)} /> : null}
      </View>
      {confirmed ? (
        <Txt variant="caption">
          {t('case.itemsExplain', { claims: c.items.filter((i) => i.origin.kind !== 'mandatory').length, checks: c.items.filter((i) => i.origin.kind === 'mandatory').length })}
        </Txt>
      ) : null}
      {c.listing.injectionSuspected ? <Badge tone="danger" icon="warning" label={t('ledger.redFlag')} /> : null}

      <Section title={t('case.steps')}>
        {STEPS.map((s, i) => (
          <NavCard
            key={s.key}
            title={`${i + 1}. ${t(s.label)}`}
            subtitle={[stepStatus(s.key), s.key === 'inspection' && c.inspectionBooking ? c.inspectionBooking.date.slice(0, 10) : undefined].filter(Boolean).join(' · ')}
            tone={done[s.key] ? 'success' : undefined}
            onPress={() => {
              if (enabled[s.key]) router.push({ pathname: s.pathname, params: { id: c.id } });
              else notify(`${i + 1}. ${t(s.label)}`, t(lockReason[s.key]));
            }}
          />
        ))}
      </Section>

      {c.status === 'walked_away' ? (
        <Button kind="secondary" label={t('case.reopen')} onPress={() => caseEvent(c.id, { type: 'reopen' })} />
      ) : !AFTER_PURCHASE.has(c.status) ? (
        <Button kind="secondary" label={t('case.walkAway')} onPress={confirmWalkAway} />
      ) : null}
      <Button kind="ghost" label={t('case.delete')} onPress={confirmDelete} />
      <Txt variant="caption">{c.listing.capturedAt.slice(0, 10)} · v{c.version}</Txt>
    </Screen>
  );
}
