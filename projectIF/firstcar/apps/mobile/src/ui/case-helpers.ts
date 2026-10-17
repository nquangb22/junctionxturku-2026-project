import { formatKm, type CarSpec, type ClaimValue, type Locale, type PurchaseCase } from '@firstcar/core';

import type { Translate } from '@/i18n';

export function caseTitle(c: PurchaseCase): string {
  const car = c.listing.car;
  return [car.make, car.model, car.modelYear].filter(Boolean).join(' ') || c.listing.redactedText.split('\n')[0]?.slice(0, 40) || '—';
}

export function caseCounts(c: PurchaseCase): { verified: number; open: number; problems: number } {
  const verified = c.items.filter((i) => i.status === 'verified').length;
  const problems = c.items.filter((i) => i.status === 'not_verified').length;
  return { verified, problems, open: c.items.length - verified - problems };
}

/** Index of the furthest step the case has reached (for the step list). */
export const STEP_OF_STATUS: Record<PurchaseCase['status'], number> = {
  draft: 0,
  reviewing_claims: 0,
  checking: 1,
  inspecting: 3,
  contract_prep: 4,
  ready_to_buy: 5,
  walked_away: 0,
  bought: 6,
  insuring: 6,
  registered: 6,
  owned: 6,
  closed: 6,
};

export function describeValue(v: ClaimValue, t: Translate): string {
  switch (v.kind) {
    case 'km':
      return formatKm(v.km);
    case 'count':
      return String(v.n);
    case 'date':
      return v.date;
    case 'bool':
      return v.value ? t('common.yes') : t('common.no');
    case 'event':
      return v.atKm !== undefined ? `@ ${formatKm(v.atKm)}` : '✓';
    case 'money':
      return `${v.eur} €`;
    case 'enum':
      return v.value;
    case 'text':
      return v.text;
  }
}

/**
 * The car of a case as a full CarSpec for the budget: ad data, overridden by registry technical
 * data where available (provenance kept per field). Undefined when make/model/year are unknown.
 */
export function carForCase(c: PurchaseCase): CarSpec | undefined {
  const ad = c.listing.car;
  const tech = c.registry?.technical;
  const make = tech?.make ?? ad.make;
  const model = tech?.model ?? ad.model;
  const modelYear = tech?.modelYear ?? ad.modelYear;
  if (!make || !model || !modelYear) return undefined;
  const reg = { kind: 'registry' as const, isMock: c.registry?.isMock };
  return {
    make,
    model,
    modelYear,
    fuel: tech?.fuel ?? ad.fuel ?? 'petrol',
    price: ad.price,
    odometerKm: Math.max(ad.odometerKm ?? 0, c.registry?.inspection?.odometerKmAtLast ?? 0) || undefined,
    co2GPerKm: tech?.co2GPerKm,
    massKg: tech?.massKg,
    hasWinterTyres: ad.hasWinterTyres,
    fieldProvenance: {
      ...ad.fieldProvenance,
      ...(tech?.co2GPerKm ? { co2GPerKm: reg } : {}),
      ...(c.registry?.inspection?.odometerKmAtLast && c.registry.inspection.odometerKmAtLast > (ad.odometerKm ?? 0) ? { odometerKm: reg } : {}),
    },
  };
}

/** Day-month-year dates in the app language (fi: 17.3.2027, en: 17/03/2027). */
/** The note the inspection screen stores with a rust finding. Stored in English, shown in the UI language. */
export const RUST_NOTE = 'rust seen on test drive';

export const noteText = (note: string, t: Translate) => (note === RUST_NOTE ? t('insp.rustNote') : note);

export const formatDate = (iso: string, locale: Locale) => new Date(iso).toLocaleDateString(locale === 'fi' ? 'fi-FI' : 'en-GB');
