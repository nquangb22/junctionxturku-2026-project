import { Redirect, Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { Alert, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { MessageKey } from '@/i18n';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { caseCounts, caseTitle } from '@/ui/case-helpers';
import { Badge, Button, NavCard, Screen, Section, Txt } from '@/ui/primitives';

type StepKey = 'claims' | 'registry' | 'ledger' | 'inspection' | 'contract' | 'decide' | 'insure';

const STEPS: { key: StepKey; label: MessageKey }[] = [
  { key: 'claims', label: 'case.step.claims' },
  { key: 'registry', label: 'case.step.registry' },
  { key: 'ledger', label: 'case.step.ledger' },
  { key: 'inspection', label: 'case.step.inspection' },
  { key: 'contract', label: 'case.step.contract' },
  { key: 'decide', label: 'case.step.decide' },
  { key: 'insure', label: 'case.step.insure' },
];

const AFTER_PURCHASE = new Set(['bought', 'insuring', 'registered', 'owned', 'closed']);
const CONTRACT_OR_LATER = new Set(['contract_prep', 'ready_to_buy', ...AFTER_PURCHASE]);

export default function CaseOverview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCase(id);
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
    Alert.alert(t('case.delete'), t('case.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('case.delete'),
        style: 'destructive',
        onPress: () => {
          deleteCase(c.id);
          router.replace('/');
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: caseTitle(c) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        <Badge tone={c.status === 'walked_away' ? 'neutral' : 'info'} label={t(`caseStatus.${c.status}`)} />
        {confirmed ? <Badge tone={counts.problems ? 'danger' : 'neutral'} label={t('case.summary', counts)} /> : null}
      </View>
      {c.listing.injectionSuspected ? <Badge tone="danger" icon="⚠️" label={t('ledger.redFlag')} /> : null}

      <Section title={t('case.steps')}>
        {STEPS.map((s, i) => (
          <NavCard
            key={s.key}
            title={`${i + 1}. ${t(s.label)}`}
            subtitle={done[s.key] ? '✓' : enabled[s.key] ? undefined : '—'}
            tone={done[s.key] ? 'success' : undefined}
            onPress={() => {
              if (enabled[s.key]) router.push({ pathname: `/cases/[id]/${s.key}` as const, params: { id: c.id } } as unknown as Href);
            }}
          />
        ))}
      </Section>

      {c.status === 'walked_away' ? (
        <Button kind="secondary" label={t('case.reopen')} onPress={() => caseEvent(c.id, { type: 'reopen' })} />
      ) : !AFTER_PURCHASE.has(c.status) ? (
        <Button kind="secondary" label={t('case.walkAway')} onPress={() => caseEvent(c.id, { type: 'walk_away' })} />
      ) : null}
      <Button kind="ghost" label={t('case.delete')} onPress={confirmDelete} />
      <Txt variant="caption">{c.listing.capturedAt.slice(0, 10)} · v{c.version}</Txt>
    </Screen>
  );
}
