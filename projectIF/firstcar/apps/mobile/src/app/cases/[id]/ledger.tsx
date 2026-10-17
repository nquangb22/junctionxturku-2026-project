import { isMandatoryItem, isStale, itemTitle, type VerificationItem, type VerificationStatus } from '@firstcar/core';
import { Redirect, Stack, router } from 'expo-router';
import { View, type ImageSourcePropType } from 'react-native';

import { Spacing, type StatusTone } from '@/constants/theme';
import { useCaseId } from '@/hooks/use-case-id';
import type { Translate } from '@/i18n';
import { useSession } from '@/state/session';
import { useCase } from '@/state/store';
import { IconLine, type IconName } from '@/ui/icon';
import { itemPhoto, PhotoThumb } from '@/ui/photos';
import { Badge, NavCard, Screen } from '@/ui/primitives';
import { StatusPill } from '@/ui/status';

const ORDER: Record<VerificationStatus, number> = { not_verified: 0, needs_inspection: 1, awaiting_evidence: 2, unchecked: 3, verified: 4 };
const CRIT_ORDER = { critical: 0, important: 1, minor: 2 } as const;

export default function Ledger() {
  const c = useCase(useCaseId());
  const { t, prefs } = useSession();
  if (!c) return <Redirect href="/" />;

  const items = [...c.items].sort((a, b) => ORDER[a.status] - ORDER[b.status] || CRIT_ORDER[a.criticality] - CRIT_ORDER[b.criticality]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('ledger.title') }} />
      {c.registry?.isMock ? <IconLine icon="info" variant="caption">{t('common.demoData')}: traficom-mock</IconLine> : null}
      {items.map((item) => (
        <NavCard
          key={item.id}
          title={itemTitle(item, prefs.locale)}
          accessibilityLabel={[itemTitle(item, prefs.locale), t(`status.${item.status}`), ...extraBadges(item, t).map((b) => b.label)].join('. ')}
          tone={item.status === 'not_verified' ? 'danger' : undefined}
          onPress={() => router.push({ pathname: '/cases/[id]/item/[itemId]', params: { id: c.id, itemId: item.id } })}
          below={<ItemBadges item={item} />}
          leading={thumbFor(itemPhoto(item.origin, c.listing.car))}
        />
      ))}
    </Screen>
  );
}

function thumbFor(source: ImageSourcePropType | undefined) {
  return source ? <PhotoThumb source={source} small /> : undefined;
}

type ExtraBadge = { tone: StatusTone; label: string; icon?: IconName };

function extraBadges(item: VerificationItem, t: Translate): ExtraBadge[] {
  const badges: ExtraBadge[] = [];
  if (isMandatoryItem(item)) badges.push({ tone: 'info', label: t('ledger.mandatory') });
  if (item.criticality === 'critical') badges.push({ tone: 'neutral', label: t('criticality.critical') });
  if (item.acceptedRisk) badges.push({ tone: 'warning', label: t('ledger.acceptedRisk') });
  if (isStale(item)) badges.push({ tone: 'warning', icon: 'clock', label: t('ledger.due') });
  if (item.findings.some((f) => f.kind === 'red_flag')) badges.push({ tone: 'danger', icon: 'flag', label: t('ledger.redFlag') });
  return badges;
}

function ItemBadges({ item }: { item: VerificationItem }) {
  const { t } = useSession();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
      <StatusPill status={item.status} t={t} />
      {extraBadges(item, t).map((b) => (
        <Badge key={b.label} tone={b.tone} icon={b.icon} label={b.label} />
      ))}
    </View>
  );
}
