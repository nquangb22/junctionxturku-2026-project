import { isStale, itemTitle, type VerificationItem, type VerificationStatus } from '@firstcar/core';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useSession } from '@/state/session';
import { useCase } from '@/state/store';
import { Badge, NavCard, Screen, Txt } from '@/ui/primitives';
import { StatusPill } from '@/ui/status';

const ORDER: Record<VerificationStatus, number> = { not_verified: 0, needs_inspection: 1, awaiting_evidence: 2, unchecked: 3, verified: 4 };
const CRIT_ORDER = { critical: 0, important: 1, minor: 2 } as const;

export default function Ledger() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCase(id);
  const { t, prefs } = useSession();
  if (!c) return <Redirect href="/" />;

  const items = [...c.items].sort((a, b) => ORDER[a.status] - ORDER[b.status] || CRIT_ORDER[a.criticality] - CRIT_ORDER[b.criticality]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('ledger.title') }} />
      {c.registry?.isMock ? <Txt variant="caption">ⓘ {t('common.demoData')}: traficom-mock</Txt> : null}
      {items.map((item) => (
        <NavCard
          key={item.id}
          title={itemTitle(item, prefs.locale)}
          tone={item.status === 'not_verified' ? 'danger' : undefined}
          onPress={() => router.push({ pathname: '/cases/[id]/item/[itemId]', params: { id: c.id, itemId: item.id } })}
          right={<ItemBadges item={item} />}
        />
      ))}
    </Screen>
  );
}

function ItemBadges({ item }: { item: VerificationItem }) {
  const { t } = useSession();
  return (
    <View style={{ alignItems: 'flex-end', gap: Spacing.xs }}>
      <StatusPill status={item.status} t={t} />
      {item.criticality === 'critical' ? <Badge tone="neutral" label={t('criticality.critical')} /> : null}
      {item.acceptedRisk ? <Badge tone="warning" label={t('ledger.acceptedRisk')} /> : null}
      {isStale(item) ? <Badge tone="warning" icon="⏱" label={t('ledger.due')} /> : null}
      {item.findings.some((f) => f.kind === 'red_flag') ? <Badge tone="danger" icon="⚑" label={t('ledger.redFlag')} /> : null}
    </View>
  );
}
