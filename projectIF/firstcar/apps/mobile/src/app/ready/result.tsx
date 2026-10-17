import { computeBudget, deductibleTradeoffs, formatEur, selectScenarios, toEuros, type BudgetLine, type RiskScenario } from '@firstcar/core';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { Translate } from '@/i18n';
import { useSession } from '@/state/session';
import { useStore } from '@/state/store';
import { IconLine } from '@/ui/icon';
import { Badge, Button, Card, Row, Screen, Section, Txt } from '@/ui/primitives';
import { VerdictCard } from '@/ui/verdict-card';

export default function ReadyResult() {
  const { t, prefs } = useSession();
  const { data } = useStore();
  const p = usePalette();
  const { from, caseId } = useLocalSearchParams<{ from?: string; caseId?: string }>();
  if (!data.profile || !data.readinessCar) return <Redirect href="/ready" />;

  const now = new Date();
  const budget = computeBudget({ profile: data.profile, car: data.readinessCar, now });
  const scenarios = selectScenarios(data.profile, data.readinessCar, prefs.locale);
  const tradeoffs = deductibleTradeoffs(data.profile, budget);
  const car = data.readinessCar;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('home.readyTitle') }} />
      <Txt variant="small">{`${car.make} ${car.model} ${car.modelYear}${car.price ? ` · ${formatEur(car.price)}` : ''}`}</Txt>
      <VerdictCard budget={budget} t={t} />

      <Section title={t('result.linesTitle')}>
        <Card>
          {budget.lines.map((l) => (
            <BudgetRow key={l.key} line={l} t={t} />
          ))}
          <Row label={t('result.linesTitle')} value={`${formatEur(budget.monthlyTotal)} ${t('common.perMonth')}`} />
        </Card>
        <Txt variant="caption">{t('result.disclaimer')}</Txt>
      </Section>

      {scenarios.length ? (
        <Section title={t('result.scenariosTitle')}>
          {scenarios.map((s) => (
            <ScenarioCard key={s.id} s={s} t={t} />
          ))}
        </Section>
      ) : null}

      <Section title={t('result.bufferTitle')}>
        <Card tone={budget.buffer.coveredBySavings === false ? 'warning' : undefined}>
          <Txt variant="h2">{t('result.bufferBody', { amount: formatEur(budget.buffer.recommended) })}</Txt>
          <Row label={t('buffer.deductible')} value={formatEur(budget.buffer.deductible)} />
          <Row label={t('buffer.firstYearRepair')} value={formatEur(budget.buffer.firstYearRepair)} />
          <Row label={t('buffer.oneMonthCosts')} value={formatEur(budget.buffer.oneMonthCosts)} />
          {budget.buffer.oneOffs.minor > 0 ? <Row label={t('buffer.oneOffs')} value={formatEur(budget.buffer.oneOffs)} /> : null}
          {budget.buffer.coveredBySavings !== undefined ? <Txt variant="bodyStrong">{t(budget.buffer.coveredBySavings ? 'result.covered' : 'result.notCovered')}</Txt> : null}
        </Card>
      </Section>

      <Section title={t('result.tradeoffTitle')}>
        <Card>
          <View style={styles.tableRow}>
            {(['result.colDeductible', 'result.colPremium', 'result.colBuffer'] as const).map((k) => (
              <Txt key={k} variant="caption" style={styles.cell}>
                {t(k)}
              </Txt>
            ))}
          </View>
          {tradeoffs.map((r) => (
            <View key={r.deductible.minor} style={[styles.tableRow, r.isChoice ? { backgroundColor: p.surfaceAlt } : null]} accessible accessibilityLabel={`${t('result.colDeductible')} ${formatEur(r.deductible)}, ${t('result.colPremium')} ${formatEur(r.premiumYearly)}, ${t('result.colBuffer')} ${formatEur(r.bufferNeeded)}${r.isChoice ? `, ${t('result.yourChoice')}` : ''}`}>
              <Txt variant={r.isChoice ? 'bodyStrong' : 'body'} style={styles.cell}>
                {formatEur(r.deductible)}
                {r.isChoice ? `\n(${t('result.yourChoice')})` : ''}
              </Txt>
              <Txt variant={r.isChoice ? 'bodyStrong' : 'body'} style={styles.cell}>
                {formatEur(r.premiumYearly)}
              </Txt>
              <Txt variant={r.isChoice ? 'bodyStrong' : 'body'} style={styles.cell}>
                {formatEur(r.bufferNeeded)}
              </Txt>
            </View>
          ))}
          <Txt variant="small">{t('result.tradeoffNote')}</Txt>
          <IconLine icon="warning" variant="caption">{t('common.estimate')}</IconLine>
        </Card>
      </Section>

      <Section title={t('result.nextTitle')}>
        {from === 'insure' && typeof caseId === 'string' ? (
          <Button label={t('result.backToInsurance')} onPress={() => router.dismissTo({ pathname: '/cases/[id]/insure', params: { id: caseId } })} />
        ) : (
          <Button label={t('result.next')} onPress={() => router.push('/cases/new')} />
        )}
        <Button kind="secondary" label={t('result.edit')} onPress={() => router.replace({ pathname: '/ready', params: from && caseId ? { from, caseId } : {} })} />
      </Section>
    </Screen>
  );
}

function BudgetRow({ line, t }: { line: BudgetLine; t: Translate }) {
  const hint = [
    line.provenance.isAssumption ? t('common.estimate') : line.provenance.kind === 'ad' ? t('common.fromAd') : line.provenance.kind === 'registry' ? t('common.fromRegistry') : undefined,
    line.oneOff ? t('result.oneOff', { amount: formatEur(line.oneOff) }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  return <Row label={t(`line.${line.key}`)} value={`${Math.round(toEuros(line.monthly))} €`} hint={hint || undefined} />;
}

function ScenarioCard({ s, t }: { s: RiskScenario; t: Translate }) {
  const stat =
    s.stat.status === 'computed' && s.stat.value !== null
      ? t('result.statValue', { value: s.stat.value.toFixed(1), source: s.stat.sourceLabel })
      : t('result.statPending', { source: s.stat.sourceLabel });
  return (
    <Card>
      <Badge tone={s.severity === 3 ? 'warning' : 'info'} label={s.title} />
      <Txt>{s.body}</Txt>
      {s.actions.map((a) => (
        <Txt key={a} variant="bodyStrong">
          → {a}
        </Txt>
      ))}
      <Txt variant="caption">
        {stat}. {s.stat.caveat}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  tableRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs, borderRadius: 6 },
  cell: { flex: 1 },
});
