/** Ownership-mode reminders (§6.4), scheduled locally by the app. Dates are UTC ISO. */
import type { Locale, PurchaseCase, Reminder } from './types';

const TITLES: Record<Reminder['kind'], Record<Locale, string>> = {
  tyre_change: { en: 'Time to change tyres', fi: 'Renkaanvaihdon aika' },
  inspection: { en: 'Periodic inspection is due', fi: 'Määräaikaiskatsastus lähestyy' },
  service: { en: 'Yearly service', fi: 'Vuosihuolto' },
  insurance_renewal: { en: 'Insurance renewal: compare and check your cover', fi: 'Vakuutuksen uusiminen: tarkista turva' },
  vehicle_tax: { en: 'Vehicle tax is due', fi: 'Ajoneuvovero erääntyy' },
};

// FI winter-tyre season ⚠️ verify: remind mid-October and mid-April
const TYRE_MONTH_DAYS: Array<[number, number]> = [[9, 15], [3, 15]];

function nextDate(now: Date, month: number, day: number): Date {
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), month, day, 9));
  return candidate > now ? candidate : new Date(Date.UTC(now.getUTCFullYear() + 1, month, day, 9));
}

const addYears = (d: Date, years: number) => new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate(), 9));

export function remindersFor(c: PurchaseCase, now: Date, locale: Locale): Reminder[] {
  const make = (kind: Reminder['kind'], date: Date): Reminder => ({ id: `${c.id}:${kind}:${date.toISOString().slice(0, 10)}`, kind, title: TITLES[kind][locale], dueAt: date.toISOString() });

  const tyres = TYRE_MONTH_DAYS.map(([m, d]) => nextDate(now, m, d)).sort((a, b) => a.getTime() - b.getTime());
  const out: Reminder[] = [make('tyre_change', tyres[0]!)];

  const nextDue = c.registry?.inspection?.nextDue;
  if (nextDue) {
    const due = new Date(`${nextDue}T09:00:00Z`);
    const twoWeeksBefore = new Date(due.getTime() - 14 * 86_400_000);
    out.push(make('inspection', twoWeeksBefore > now ? twoWeeksBefore : due));
  }

  const bought = c.decision?.kind === 'buy' ? new Date(c.decision.at) : now;
  out.push(make('service', addYears(bought, 1)));
  out.push(make('vehicle_tax', addYears(bought, 1)));
  if (c.handoff?.status === 'bound' || c.handoff?.status === 'registered') {
    const renewal = addYears(new Date(c.handoff.consentAt ?? now.toISOString()), 1);
    out.push(make('insurance_renewal', new Date(renewal.getTime() - 30 * 86_400_000)));
  }
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
