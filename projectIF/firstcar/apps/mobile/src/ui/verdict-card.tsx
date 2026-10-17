import { LOAN_APR, LOAN_MONTHS, VERDICT_THRESHOLDS, formatEur, type OwnershipBudget, type VerdictLevel } from '@firstcar/core';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing, VERDICT_TONE, toneColors } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { Translate } from '@/i18n';
import { Card, Txt } from '@/ui/primitives';

const pct = (share: number) => Math.round(share * 100);

/** Legend rows, built from the same thresholds the verdict uses. */
function bands(t: Translate): { level: Exclude<VerdictLevel, 'unknown'>; range: string }[] {
  const { comfortable, manageable, tight } = VERDICT_THRESHOLDS;
  return [
    { level: 'comfortable', range: t('result.bandUnder', { n: pct(comfortable) }) },
    { level: 'manageable', range: t('result.bandBetween', { a: pct(comfortable), b: pct(manageable) }) },
    { level: 'tight', range: t('result.bandBetween', { a: pct(manageable), b: pct(tight) }) },
    { level: 'over_budget', range: t('result.bandOver', { n: pct(tight) }) },
  ];
}

export function VerdictCard({ budget, t }: { budget: OwnershipBudget; t: Translate }) {
  const { level, shareOfIncome, incomeMid } = budget.verdict;
  const cash = budget.cashCheck;
  const tone = toneColors(usePalette(), VERDICT_TONE[level]);
  return (
    <>
      <Card tone={VERDICT_TONE[level]}>
        {/* Without income there is no share and no verdict word: only the monthly figure. */}
        {shareOfIncome !== undefined ? (
          <>
            <View style={styles.headline} accessible accessibilityRole="header" accessibilityLabel={`${pct(shareOfIncome)} %: ${t(`verdict.${level}`)}`}>
              <Text style={[styles.big, { color: tone.fg }]}>{`${pct(shareOfIncome)} %`}</Text>
              <Txt variant="h2" color={tone.fg}>
                {t(`verdict.${level}`)}
              </Txt>
            </View>
            <Txt>{t('result.share', { pct: pct(shareOfIncome) })}</Txt>
          </>
        ) : null}
        <Txt variant={shareOfIncome !== undefined ? 'bodyStrong' : 'title'}>{t('result.monthly', { amount: formatEur(budget.monthlyTotal) })}</Txt>
        {incomeMid ? <Txt variant="small">{t('result.division', { amount: formatEur(budget.monthlyTotal), income: formatEur(incomeMid) })}</Txt> : <Txt>{t('result.addIncome')}</Txt>}
        {cash ? (
          <Txt variant="small">
            {cash.available
              ? t('result.cashCheck', { price: formatEur(cash.price), buffer: formatEur(cash.buffer), needed: formatEur(cash.needed), available: formatEur(cash.available) })
              : t('result.cashCheckNoSavings', { price: formatEur(cash.price), buffer: formatEur(cash.buffer), needed: formatEur(cash.needed) })}
          </Txt>
        ) : null}
        {cash?.loanPrincipal ? (
          <Txt variant="small">{t('result.loanNote', { principal: formatEur(cash.loanPrincipal), years: LOAN_MONTHS / 12, apr: Math.round(LOAN_APR * 100) })}</Txt>
        ) : null}
      </Card>
      {shareOfIncome !== undefined ? <BandMeter level={level} t={t} /> : null}
    </>
  );
}

/** The four bands as one segmented bar; the buyer's band is filled and labelled, the rest stay pale. */
function BandMeter({ level, t }: { level: VerdictLevel; t: Translate }) {
  const p = usePalette();
  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={styles.meter}>
        {bands(t).map((b) => {
          const c = toneColors(p, VERDICT_TONE[b.level]);
          const mine = b.level === level;
          return (
            <View key={b.level} style={styles.segment} accessible accessibilityLabel={`${t(`verdict.${b.level}`)}, ${b.range}${mine ? `, ${t('result.yourBand')}` : ''}`}>
              <View style={[styles.bar, { backgroundColor: mine ? c.fg : c.bg }]} />
              <Txt variant="caption" color={mine ? c.fg : p.textSecondary} style={mine ? styles.mine : undefined}>
                {t(`verdict.${b.level}`)}
              </Txt>
              <Txt variant="caption">{b.range}</Txt>
            </View>
          );
        })}
      </View>
      <Txt variant="caption">{t('result.rule')}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: Spacing.md },
  big: { fontFamily: Fonts.semibold, fontSize: 44, lineHeight: 52, letterSpacing: -1 },
  meter: { flexDirection: 'row', gap: Spacing.xs },
  segment: { flex: 1, gap: 2 },
  bar: { height: 8, borderRadius: Radius.pill, marginBottom: Spacing.xs },
  mine: { fontFamily: Fonts.semibold },
});
