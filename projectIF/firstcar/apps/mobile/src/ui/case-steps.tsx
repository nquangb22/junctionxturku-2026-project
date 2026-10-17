/**
 * The seven steps of a case, their state, and the progress bar shown at the top of every step screen.
 * The case overview lists the same steps, so both read their state from caseSteps().
 */
import type { PurchaseCase } from '@firstcar/core';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { MessageKey, Translate } from '@/i18n';
import { caseCounts } from '@/ui/case-helpers';
import { notify } from '@/ui/dialog';
import { Icon } from '@/ui/icon';
import { tick } from '@/ui/motion';
import { Txt } from '@/ui/primitives';

export type StepKey = 'claims' | 'registry' | 'ledger' | 'inspection' | 'contract' | 'decide' | 'insure';

export const STEPS: { key: StepKey; label: MessageKey; pathname: `/cases/[id]/${StepKey}` }[] = [
  { key: 'claims', label: 'case.step.claims', pathname: '/cases/[id]/claims' },
  { key: 'registry', label: 'case.step.registry', pathname: '/cases/[id]/registry' },
  { key: 'ledger', label: 'case.step.ledger', pathname: '/cases/[id]/ledger' },
  { key: 'inspection', label: 'case.step.inspection', pathname: '/cases/[id]/inspection' },
  { key: 'contract', label: 'case.step.contract', pathname: '/cases/[id]/contract' },
  { key: 'decide', label: 'case.step.decide', pathname: '/cases/[id]/decide' },
  { key: 'insure', label: 'case.step.insure', pathname: '/cases/[id]/insure' },
];

export const AFTER_PURCHASE = new Set(['bought', 'insuring', 'registered', 'owned', 'closed']);
const CONTRACT_OR_LATER = new Set(['contract_prep', 'ready_to_buy', ...AFTER_PURCHASE]);

// Shown under a locked step and on tap, so a locked step is never a silent no-op.
export const LOCK_REASON: Record<StepKey, MessageKey> = {
  claims: 'case.locked.claims',
  registry: 'case.locked.claims',
  ledger: 'case.locked.claims',
  inspection: 'case.locked.registry',
  contract: 'case.locked.inspection',
  decide: 'case.locked.inspection',
  insure: 'case.locked.insure',
};

export interface StepState {
  enabled: Record<StepKey, boolean>;
  /** Started but not done: shown as "In progress" so every step has exactly one status. */
  started: Record<StepKey, boolean>;
  done: Record<StepKey, boolean>;
}

export function caseSteps(c: PurchaseCase): StepState {
  const confirmed = c.items.length > 0;
  const { open } = caseCounts(c);
  return {
    enabled: {
      claims: true,
      registry: confirmed,
      ledger: confirmed,
      inspection: !!c.registry,
      contract: CONTRACT_OR_LATER.has(c.status),
      decide: CONTRACT_OR_LATER.has(c.status),
      insure: AFTER_PURCHASE.has(c.status),
    },
    started: {
      claims: c.status === 'reviewing_claims',
      registry: false,
      ledger: c.items.some((i) => i.status !== 'unchecked' || i.questionAsked || i.acceptedRisk),
      inspection: c.status === 'inspecting' || c.testDriveDone || c.inspectionDone || !!c.inspectionBooking,
      contract: c.status === 'contract_prep',
      decide: c.status === 'ready_to_buy',
      insure: c.status === 'bought' || c.status === 'insuring' || c.status === 'registered',
    },
    done: {
      claims: confirmed,
      registry: !!c.registry,
      ledger: confirmed && open === 0,
      inspection: c.testDriveDone,
      contract: CONTRACT_OR_LATER.has(c.status) && c.status !== 'contract_prep',
      decide: AFTER_PURCHASE.has(c.status),
      insure: c.status === 'owned' || c.status === 'registered',
    },
  };
}

/**
 * Seven dots joined by a line: done steps are filled with a check, the current one has a ring, locked ones are
 * faint. Tapping a step opens it, or says why it is locked. Below: "Step 3 of 7: Questions & evidence".
 */
export function CaseProgress({ c, current, t }: { c: PurchaseCase; current: StepKey; t: Translate }) {
  const p = usePalette();
  const s = caseSteps(c);
  const index = STEPS.findIndex((x) => x.key === current);

  const open = (i: number) => {
    const step = STEPS[i]!;
    if (step.key === current) return;
    if (!s.enabled[step.key]) {
      notify(`${i + 1}. ${t(step.label)}`, t(LOCK_REASON[step.key]));
      return;
    }
    tick();
    // Replace, not push: moving along the bar should not pile up a long back history.
    router.replace({ pathname: step.pathname, params: { id: c.id } });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {STEPS.map((step, i) => {
          const isDone = s.done[step.key];
          const isCurrent = i === index;
          const locked = !s.enabled[step.key];
          const fill = isDone ? p.primary : isCurrent ? p.surface : p.surfaceAlt;
          const ring = isDone || isCurrent ? p.primary : p.borderStrong;
          const status = isDone ? '✓' : locked ? t(LOCK_REASON[step.key]) : s.started[step.key] ? t('case.inProgress') : '';
          return (
            <View key={step.key} style={styles.cell}>
              {i > 0 ? <View style={[styles.line, styles.lineLeft, { backgroundColor: s.done[STEPS[i - 1]!.key] ? p.primary : p.border }]} /> : null}
              {i < STEPS.length - 1 ? <View style={[styles.line, styles.lineRight, { backgroundColor: isDone ? p.primary : p.border }]} /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${i + 1}. ${t(step.label)}${status ? `, ${status}` : ''}`}
                accessibilityState={{ selected: isCurrent, disabled: locked }}
                hitSlop={6}
                onPress={() => open(i)}
                style={styles.hit}>
                <View style={[styles.dot, isCurrent && styles.dotCurrent, { backgroundColor: fill, borderColor: ring, opacity: locked && !isDone ? 0.6 : 1 }]}>
                  {isDone ? (
                    <Icon name="check" size={isCurrent ? 18 : 15} color={p.onPrimary} />
                  ) : (
                    <Txt variant="caption" color={isCurrent ? p.primary : p.textSecondary} style={styles.num}>
                      {String(i + 1)}
                    </Txt>
                  )}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
      <Txt variant="small" color={p.text} style={styles.label}>
        {t('case.progress', { n: index + 1, total: STEPS.length, step: t(STEPS[index]!.label) })}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  track: { flexDirection: 'row', alignItems: 'center' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 44 },
  line: { position: 'absolute', top: 21, height: 2 },
  lineLeft: { left: 0, right: '50%' },
  lineRight: { left: '50%', right: 0 },
  hit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotCurrent: { width: 30, height: 30, borderRadius: 15, borderWidth: 3 },
  num: { fontSize: 12, lineHeight: 14 },
  label: { textAlign: 'center' },
});
