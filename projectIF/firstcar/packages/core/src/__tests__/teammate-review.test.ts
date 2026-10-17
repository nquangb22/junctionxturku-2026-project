import { describe, expect, it } from 'vitest';

import { computeBudget, loanInstalment, verdictBand } from '../budget';
import { applyEvent, createCase, type CaseEvent, type Ctx } from '../case';
import { DEMO_ADS, MOCK_REGISTRY } from '../fixtures';
import { renderFinding } from '../ledger';
import { mileageGap, VALUE_PER_KM_EUR } from '../mileage';
import { eur } from '../money';
import { analyseAd } from '../pipeline';
import { quoteTranslationFor, translateQuote } from '../translate';
import type { BuyerProfile, PurchaseCase, RegistryCheck } from '../types';

const NOW = new Date('2026-10-17T10:00:00Z');
const ctx: Ctx = { now: NOW, locale: 'en' };

function newCase(adId: string): PurchaseCase {
  const ad = DEMO_ADS.find((a) => a.id === adId)!;
  return createCase(`case-${adId}`, analyseAd(ad.text, { now: NOW, textHash: 'h', inputKind: 'demo_fixture', llm: ad.llm, llmSource: 'mock' }), NOW);
}

function apply(c: PurchaseCase, ...events: CaseEvent[]): PurchaseCase {
  return events.reduce((acc, e) => {
    const r = applyEvent(acc, e, ctx);
    if (!r.ok) throw new Error(`${e.type}: ${r.error}`);
    return r.next;
  }, c);
}

const registry = (plate: string): RegistryCheck => ({ ...MOCK_REGISTRY[plate]!, fetchedAt: NOW.toISOString() });
const golf = () => apply(newCase('golf-odometer'), { type: 'claims_confirmed' }, { type: 'registry_result', registry: registry('ABC-123') });
const corolla = () => apply(newCase('corolla-clean'), { type: 'claims_confirmed' }, { type: 'registry_result', registry: registry('XYZ-789') });

describe('mileage gap (T2)', () => {
  it('computes difference, percentage, value impact and maintenance due for the Golf demo', () => {
    const gap = mileageGap(golf(), NOW)!;
    expect(gap.adKm).toBe(180_000);
    expect(gap.registryKm).toBe(212_400);
    expect(gap.diffKm).toBe(32_400);
    expect(gap.pct).toBe(18);
    expect(gap.eurPerKm).toBe(VALUE_PER_KM_EUR.over10y);
    expect(gap.valueImpact.minor).toBe(Math.round(32_400 * 0.04) * 100);
    expect(gap.maintenanceDue.map((m) => m.kind)).toEqual(['timing_belt']);
    expect(gap.total.minor).toBe(gap.valueImpact.minor + gap.maintenanceDue[0]!.cost.minor);
  });

  it('is undefined when the ad and the registry agree', () => {
    expect(mileageGap(corolla(), NOW)).toBeUndefined();
  });

  it('uses the higher per-km value for a car under 10 years old', () => {
    const c = golf();
    const newer = { ...c, listing: { ...c.listing, car: { ...c.listing.car, modelYear: 2020 } } };
    const gap = mileageGap(newer, NOW)!;
    expect(gap.eurPerKm).toBe(VALUE_PER_KM_EUR.under10y);
    expect(gap.valueImpact.minor).toBe(Math.round(32_400 * 0.08) * 100);
  });

  it('is undefined when the registry reading is lower than the ad', () => {
    const c = golf();
    const lower = { ...c, registry: { ...c.registry!, inspection: { ...c.registry!.inspection!, odometerKmAtLast: 150_000 } } };
    expect(mileageGap(lower, NOW)).toBeUndefined();
  });

  it('is undefined before the registry has been checked', () => {
    expect(mileageGap(apply(newCase('golf-odometer'), { type: 'claims_confirmed' }), NOW)).toBeUndefined();
  });

  it('explains the difference in the finding text', () => {
    const odo = golf().items.find((i) => i.origin.kind === 'claim' && i.origin.claimType === 'odometer')!;
    const text = renderFinding(odo.findings.find((f) => f.code === 'odometer_rollback')!, 'en');
    expect(text).toContain('32');
    expect(text).toContain('+18 %');
  });
});

describe('contract for contradicted claims (S6)', () => {
  it('records the mileage as disputed instead of asking the seller to assure it', () => {
    const c = golf();
    const odoId = c.items.find((i) => i.origin.kind === 'claim' && i.origin.claimType === 'odometer')!.id;
    expect(c.clauses.some((cl) => cl.kind === 'seller_assurance' && cl.sourceItemIds.includes(odoId))).toBe(false);
    const disputed = c.clauses.find((cl) => cl.kind === 'disputed_claim' && cl.sourceItemIds.includes(odoId))!;
    expect(disputed.text).toContain('Odometer reading at handover');
    expect(disputed.text).toContain('212');
  });
});

describe('skipping the inspection (S2)', () => {
  it('lets the buyer continue to the contract after the test drive', () => {
    const c = apply(golf(), { type: 'start_inspection' }, { type: 'test_drive_done' });
    expect(applyEvent(c, { type: 'start_contract' }, ctx)).toEqual({ ok: false, error: 'inspection_missing' });
    const skipped = apply(c, { type: 'inspection_skipped' }, { type: 'start_contract' });
    expect(skipped.status).toBe('contract_prep');
    expect(skipped.inspectionDone).toBe(false);
  });

  it('needs a registry check first', () => {
    const c = apply(newCase('golf-odometer'), { type: 'claims_confirmed' });
    expect(applyEvent(c, { type: 'inspection_skipped' }, ctx)).toEqual({ ok: false, error: 'registry_missing' });
  });
});

describe('inspection screen state (S3, S4, S5)', () => {
  it('keeps the test-drive answers', () => {
    const c = apply(golf(), { type: 'test_drive_done', answers: { vin_plate: 'ok', rust_check: 'issue' } });
    expect(c.testDriveAnswers).toEqual({ vin_plate: 'ok', rust_check: 'issue' });
  });

  it('replaces an earlier inspection report for the same item', () => {
    const c = golf();
    const id = c.items.find((i) => i.inspectable && i.status !== 'verified')!.id;
    const first = apply(c, { type: 'inspection_result', outcomes: { [id]: 'issue' } });
    const updated = apply(first, { type: 'inspection_result', outcomes: { [id]: 'ok' } });
    const reports = updated.evidence.filter((e) => e.kind === 'inspection_report' && e.itemIds.includes(id));
    expect(reports.map((e) => e.outcome)).toEqual(['supports']);
  });

  it('records a booking and rejects an invalid one', () => {
    const c = apply(golf(), { type: 'inspection_booked', partner: 'Demo Katsastus', date: '2026-10-20T09:00:00.000Z' });
    expect(c.inspectionBooking).toEqual({ partner: 'Demo Katsastus', date: '2026-10-20T09:00:00.000Z' });
    expect(applyEvent(c, { type: 'inspection_booked', partner: '', date: 'x' }, ctx)).toEqual({ ok: false, error: 'invalid_booking' });
  });
});

describe('affordability (T6, E2)', () => {
  const car = { make: 'Volkswagen', model: 'Golf', modelYear: 2012, fuel: 'diesel' as const, price: eur(6900), odometerKm: 180_000, hasWinterTyres: true, fieldProvenance: {} };
  const profile = (over: Partial<BuyerProfile> = {}): BuyerProfile => ({
    country: 'FI',
    locale: 'en',
    density: 'suburban',
    ageBand: '20-25',
    firstTimeDriver: true,
    netMonthlyIncome: { low: eur(1500), high: eur(2000) },
    savings: { low: eur(500), high: eur(1500) },
    coverIntent: 'liability_plus_partial',
    deductible: eur(300),
    ...over,
  });

  it('maps a share of pay to its band at the thresholds', () => {
    expect(verdictBand(0.1)).toBe('comfortable');
    expect(verdictBand(0.15)).toBe('manageable');
    expect(verdictBand(0.249)).toBe('manageable');
    expect(verdictBand(0.25)).toBe('tight');
    expect(verdictBand(0.349)).toBe('tight');
    expect(verdictBand(0.35)).toBe('over_budget');
  });

  it('computes an annuity instalment', () => {
    expect(loanInstalment(eur(6900), 0.07, 60).minor).toBe(13663);
    expect(loanInstalment(eur(1200), 0, 12).minor).toBe(10000);
    expect(loanInstalment(eur(0)).minor).toBe(0);
    expect(loanInstalment(eur(6900), 0.07, 0).minor).toBe(0);
    expect(loanInstalment(eur(6900), 0.07, -12).minor).toBe(0);
  });

  it('adds a loan line that raises the share when savings do not cover the price', () => {
    const without = computeBudget({ profile: profile(), car, now: NOW });
    const withLoan = computeBudget({ profile: profile({ payment: 'savings' }), car, now: NOW });
    expect(without.lines.some((l) => l.key === 'loan')).toBe(false);
    expect(withLoan.lines.some((l) => l.key === 'loan')).toBe(true);
    expect(withLoan.verdict.shareOfIncome!).toBeGreaterThan(without.verdict.shareOfIncome!);
    expect(withLoan.cashCheck?.coveredWithoutLoan).toBe(false);
    expect(withLoan.cashCheck?.needed.minor).toBe(car.price.minor + withLoan.buffer.recommended.minor);
    expect(withLoan.verdict.incomeMid?.minor).toBe(eur(1750).minor);
  });

  it('is never comfortable when the price is not covered without a loan', () => {
    const rich = profile({ netMonthlyIncome: { low: eur(3500), high: eur(5000) }, payment: 'unsure' });
    const b = computeBudget({ profile: rich, car, now: NOW });
    expect(b.cashCheck?.coveredWithoutLoan).toBe(false);
    expect(b.verdict.level).not.toBe('comfortable');
  });
});

describe('editing a claim (T7)', () => {
  it('changes the value and the quote, and drops the stale highlight', () => {
    const c = newCase('golf-odometer');
    const odo = c.claims.find((cl) => cl.type === 'odometer')!;
    const edited = apply(c, { type: 'claim_edited', claimId: odo.id, value: { kind: 'km', km: 212_400 }, quote: 'Ajettu 212 400 km' });
    const after = edited.claims.find((cl) => cl.id === odo.id)!;
    expect(after.value).toEqual({ kind: 'km', km: 212_400 });
    expect(after.quote).toBe('Ajettu 212 400 km');
    expect(after.rawStart).toBeUndefined();
    expect(applyEvent(c, { type: 'claim_edited', claimId: odo.id, quote: '  ' }, ctx)).toEqual({ ok: false, error: 'empty_quote' });
  });
});

describe('contract blanks (S7)', () => {
  it('prefills known values, keeps typed ones, and blanks the rest', () => {
    const c = golf();
    const parties = () => c.clauses.find((cl) => cl.kind === 'parties')!.text;
    expect(parties()).toContain('Seller: ______');
    const filled = apply(c, { type: 'contract_field_set', field: 'buyer', value: '  Aino Ostaja ' }, { type: 'contract_field_set', field: 'handover', value: '20.10.2026 at 17:00' });
    const text = (kind: string) => filled.clauses.find((cl) => cl.kind === kind)!.text;
    expect(text('parties')).toContain('Buyer: Aino Ostaja.');
    expect(text('handover_time')).toContain('20.10.2026 at 17:00');
    const owner = apply(filled, { type: 'owner_compared', sellerNameFromId: 'Mikko Mallikas' });
    expect(owner.clauses.find((cl) => cl.kind === 'parties')!.text).toContain('Seller: Mikko Mallikas');
  });
});

describe('quote translations (T5)', () => {
  it('translates every demo-ad quote in both directions', () => {
    for (const ad of DEMO_ADS) {
      const c = newCase(ad.id);
      for (const cl of c.claims) {
        expect(cl.quoteLang, cl.quote).toBeDefined();
        expect(cl.quoteTranslated, `${ad.id}: ${cl.quote}`).toBeTruthy();
      }
    }
    expect(translateQuote('Ajettu 180 000 km', 'fi')).toBe('Driven 180 000 km');
    expect(translateQuote('Jakohihna vaihdettu 90 tkm', 'fi')).toBe('Timing belt replaced at 90 000 km');
    expect(translateQuote('Mileage 98 000 km', 'en')).toBe('Ajettu 98 000 km');
  });

  it('shows a translation only when the quote language differs from the UI', () => {
    const fiClaim = newCase('golf-odometer').claims.find((cl) => cl.type === 'odometer')!;
    expect(quoteTranslationFor(fiClaim, 'en')).toBe('Driven 180 000 km');
    expect(quoteTranslationFor(fiClaim, 'fi')).toBeNull();
    const enClaim = newCase('focus-tax').claims.find((cl) => cl.type === 'odometer')!;
    expect(quoteTranslationFor(enClaim, 'fi')).toBe('Ajettu 98 000 km');
    expect(quoteTranslationFor(enClaim, 'en')).toBeNull();
  });

  it('returns null rather than guessing', () => {
    expect(translateQuote('Moottori käy tasaisesti', 'fi')).toBeNull();
  });
});

describe('price claim (E11)', () => {
  it('extracts the asking price from every demo ad that states one', () => {
    for (const ad of DEMO_ADS) {
      const c = newCase(ad.id);
      if (!c.listing.car.price) continue;
      const price = c.claims.find((cl) => cl.type === 'price');
      expect(price?.value, ad.id).toEqual({ kind: 'money', eur: c.listing.car.price.minor / 100 });
    }
  });
});

describe('required clauses and undo (S9, E13)', () => {
  it('refuses to leave out a required clause', () => {
    const c = golf();
    expect(applyEvent(c, { type: 'clause_toggled', clauseId: 'parties' }, ctx)).toEqual({ ok: false, error: 'clause_required' });
  });

  it('restores a removed claim in place with its highlight', () => {
    const c = newCase('golf-odometer');
    const index = 2;
    const claim = c.claims[index]!;
    const removed = apply(c, { type: 'claim_removed', claimId: claim.id });
    const restored = apply(removed, { type: 'claim_restored', claim, index });
    expect(restored.claims).toEqual(c.claims);
    expect(applyEvent(restored, { type: 'claim_restored', claim, index }, ctx)).toEqual({ ok: false, error: 'claim_exists' });
  });
});
