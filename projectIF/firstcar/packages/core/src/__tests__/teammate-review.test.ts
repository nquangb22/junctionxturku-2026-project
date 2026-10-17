import { describe, expect, it } from 'vitest';

import { applyEvent, createCase, type CaseEvent, type Ctx } from '../case';
import { DEMO_ADS, MOCK_REGISTRY } from '../fixtures';
import { renderFinding } from '../ledger';
import { mileageGap, VALUE_PER_KM_EUR } from '../mileage';
import { analyseAd } from '../pipeline';
import type { PurchaseCase, RegistryCheck } from '../types';

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
