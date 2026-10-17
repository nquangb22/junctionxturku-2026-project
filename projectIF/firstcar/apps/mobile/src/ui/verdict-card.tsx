import { formatEur, type OwnershipBudget } from '@firstcar/core';

import { VERDICT_TONE } from '@/constants/theme';
import type { Translate } from '@/i18n';
import { Card, Txt } from '@/ui/primitives';

export function VerdictCard({ budget, t }: { budget: OwnershipBudget; t: Translate }) {
  const level = budget.verdict.level;
  return (
    <Card tone={VERDICT_TONE[level]}>
      <Txt variant="title" accessibilityRole="header">
        {budget.verdict.shareOfIncome !== undefined
          ? `${Math.round(budget.verdict.shareOfIncome * 100)} %: ${t(`verdict.${level}`)}`
          : t(`verdict.${level}`)}
      </Txt>
      {budget.verdict.shareOfIncome !== undefined ? <Txt>{t('result.share', { pct: Math.round(budget.verdict.shareOfIncome * 100) })}</Txt> : null}
      <Txt variant="bodyStrong">{t('result.monthly', { amount: formatEur(budget.monthlyTotal) })}</Txt>
    </Card>
  );
}
