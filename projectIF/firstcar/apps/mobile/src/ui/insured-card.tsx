/** The accepted insurance terms, shown after "Accept and insure" on the insurance step and on My car. */
import { formatEur, type PurchaseCase } from '@firstcar/core';

import { useSession } from '@/state/session';
import { formatDate } from '@/ui/case-helpers';
import { Card, Txt } from '@/ui/primitives';

export function InsuredCard({ c }: { c: PurchaseCase }) {
  const { t, prefs } = useSession();
  const h = c.handoff;
  if (!h?.quoteMonthly || (h.status !== 'bound' && h.status !== 'registered')) return null;
  return (
    <Card tone="success">
      <Txt variant="bodyStrong">
        {t('insure.insured', {
          amount: formatEur(h.quoteMonthly),
          cover: t(`cover.${h.payload.coverIntent}`),
          deductible: formatEur(h.payload.deductible),
          date: formatDate(h.payload.purchaseDate, prefs.locale),
        })}
      </Txt>
    </Card>
  );
}
