import { LOAN_APR, LOAN_MONTHS, VERDICT_THRESHOLDS, formatEur, type OwnershipBudget, type VerdictLevel } from '@firstcar/core';
import { View } from 'react-native';

import { Spacing, VERDICT_TONE } from '@/constants/theme';
import type { Translate } from '@/i18n';
import { Badge, Card, Txt } from '@/ui/primitives';

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
  return (
    <>
      <Card tone={VERDICT_TONE[level]}>
        {/* Without income there is no share and no verdict word: only the monthly figure. */}
        {shareOfIncome !== undefined ? (
          <>
            <Txt variant="title" accessibilityRole="header">
              {`${pct(shareOfIncome)} %: ${t(`verdict.${level}`)}`}
            </Txt>
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
      {shareOfIncome !== undefined ? (
        <View style={{ gap: Spacing.xs }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
            {bands(t).map((b) => (
              <Badge
                key={b.level}
                tone={b.level === level ? VERDICT_TONE[b.level] : 'neutral'}
                icon={b.level === level ? '▶' : undefined}
                label={`${t(`verdict.${b.level}`)} · ${b.range}${b.level === level ? ` (${t('result.yourBand')})` : ''}`}
              />
            ))}
          </View>
          <Txt variant="caption">{t('result.rule')}</Txt>
        </View>
      ) : null}
    </>
  );
}
