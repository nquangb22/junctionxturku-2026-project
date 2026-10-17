import { Redirect, Stack, router } from 'expo-router';
import { View } from 'react-native';

import { useCaseId } from '@/hooks/use-case-id';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/state/session';
import { useCase, useStore } from '@/state/store';
import { caseCounts, caseTitle } from '@/ui/case-helpers';
import { AFTER_PURCHASE, caseSteps, LOCK_REASON, STEPS, type StepKey } from '@/ui/case-steps';
import { confirmAction, notify } from '@/ui/dialog';
import { CarGallery } from '@/ui/photos';
import { Badge, Button, NavCard, Screen, Section, Txt } from '@/ui/primitives';

export default function CaseOverview() {
  const c = useCase(useCaseId());
  const { t } = useSession();
  const { caseEvent, deleteCase } = useStore();

  if (!c) return <Redirect href="/" />;
  const counts = caseCounts(c);
  const confirmed = c.items.length > 0;

  const { enabled, started, done } = caseSteps(c);
  const stepStatus = (k: StepKey) =>
    done[k] ? '✓' : !enabled[k] ? `— · ${t(LOCK_REASON[k])}` : started[k] ? t('case.inProgress') : '—';

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
      <CarGallery car={c.listing.car} t={t} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
        <Badge tone={c.status === 'walked_away' ? 'neutral' : 'info'} label={t(`caseStatus.${c.status}`)} />
        {confirmed ? <Badge tone={counts.problems ? 'danger' : 'neutral'} label={t('case.summary', counts)} /> : null}
      </View>
      {confirmed ? (
        <Txt variant="caption">
          {/* Claims = exactly what the claims tab lists; a claim tagged Mandatory still counts as a claim. */}
          {t('case.itemsExplain', { claims: c.claims.length, checks: c.items.filter((i) => i.origin.kind === 'mandatory').length })}
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
              else notify(`${i + 1}. ${t(s.label)}`, t(LOCK_REASON[s.key]));
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
