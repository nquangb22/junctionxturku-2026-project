import { describe, expect, it } from 'vitest';

import { applyEvent, createCase, evaluateGate, type CaseEvent, type Ctx } from '../case';
import { DEMO_ADS, MOCK_REGISTRY } from '../fixtures';
import { beltDueCost, contractText, inspectionPlan, openQuestions, questionFor } from '../generators';
import { itemTitle, renderFinding } from '../ledger';
import { eur, formatKm } from '../money';
import { analyseAd } from '../pipeline';
import { remindersFor } from '../reminders';
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
const item = (c: PurchaseCase, id: string) => c.items.find((i) => i.id === id)!;
const claimItem = (c: PurchaseCase, type: string) => c.items.find((i) => i.origin.kind === 'claim' && i.origin.claimType === type)!;

describe('Golf odometer cascade (demo killer moment)', () => {
  const confirmed = apply(newCase('golf-odometer'), { type: 'claims_confirmed' });
  const checked = apply(confirmed, { type: 'registry_result', registry: registry('ABC-123') });

  it('starts every claim unchecked, with no_rust / no_accidents needing inspection', () => {
    expect(confirmed.status).toBe('checking');
    expect(claimItem(confirmed, 'odometer').status).toBe('unchecked');
    expect(claimItem(confirmed, 'no_rust').status).toBe('needs_inspection');
    expect(claimItem(confirmed, 'no_accidents').status).toBe('needs_inspection');
    // The ad's inspection claim replaces the mandatory inspection check.
    expect(confirmed.items.some((i) => i.id === 'mandatory:inspection_valid')).toBe(false);
  });

  it('turns the odometer red with the registry reading', () => {
    const odo = claimItem(checked, 'odometer');
    expect(odo.status).toBe('not_verified');
    const finding = odo.findings.find((f) => f.code === 'odometer_rollback')!;
    expect(renderFinding(finding, 'en')).toContain(`the odometer read ${formatKm(212_400)}: ${formatKm(32_400)} more than the ad (+18 %).`);
  });

  it('cascades: the belt becomes due and the budget gets the belt job', () => {
    const belt = claimItem(checked, 'timing_belt');
    expect(belt.findings.some((f) => f.code === 'belt_due')).toBe(true);
    expect(beltDueCost(checked)).toBe(800);
    expect(beltDueCost(confirmed)).toBe(0);
  });

  it('verifies what the registry confirms', () => {
    expect(item(checked, 'mandatory:vehicle_tax_paid').status).toBe('verified');
    expect(item(checked, 'mandatory:not_finance_owned').status).toBe('verified');
    expect(claimItem(checked, 'inspection_valid').status).toBe('verified');
    expect(claimItem(checked, 'owners_count').status).toBe('verified');
  });

  it('writes the bilingual seller question with the registry numbers', () => {
    const q = questionFor(checked, claimItem(checked, 'odometer'), 'en')!;
    expect(q.buyerText).toContain('212 400 km');
    expect(q.sellerText).toMatch(/^Rekisterin mukaan mittarilukema oli 212 400 km/);
    expect(openQuestions(checked, 'en').length).toBeGreaterThan(3);
  });

  it('records the contradicted odometer as disputed, not as a seller assurance', () => {
    const id = claimItem(checked, 'odometer').id;
    expect(checked.clauses.find((cl) => cl.id === `assurance:${id}`)).toBeUndefined();
    const clause = checked.clauses.find((cl) => cl.id === `dispute:${id}`);
    expect(clause?.included).toBe(true);
    expect(clause?.text).toContain(formatKm(180_000));
  });

  it('recommends a pre-purchase inspection with reasons', () => {
    const plan = inspectionPlan(checked, 'en', NOW);
    expect(plan.prePurchase.recommended).toBe(true);
    expect(plan.prePurchase.reasons).toContain('The ad contradicts the registry');
    expect(plan.testDrive.find((t) => t.id === 'vin_plate')?.linkedItemIds).toEqual(['mandatory:vin_matches']);
  });

  it('replaces registry evidence on a repeated check instead of stacking it', () => {
    const again = apply(checked, { type: 'registry_result', registry: registry('ABC-123') });
    expect(again.evidence.filter((e) => e.kind === 'registry_result').length).toBe(checked.evidence.filter((e) => e.kind === 'registry_result').length);
  });

  it('does not mutate the previous case', () => {
    expect(confirmed.registry).toBeUndefined();
    expect(confirmed.version).toBeLessThan(checked.version);
  });
});

describe('full happy path to ownership', () => {
  it('goes from paste to owned with reminders', () => {
    let c = apply(newCase('golf-odometer'), { type: 'claims_confirmed' }, { type: 'registry_result', registry: registry('ABC-123') });
    const beltId = claimItem(c, 'timing_belt').id;
    const rustId = claimItem(c, 'no_rust').id;
    const accidentsId = claimItem(c, 'no_accidents').id;

    c = apply(
      c,
      { type: 'owner_compared', sellerNameFromId: 'mikko  mallikas' },
      { type: 'vin_confirmed', matches: true },
      { type: 'payment_confirmed', safe: true },
      { type: 'start_inspection' },
      { type: 'test_drive_done' },
      { type: 'inspection_result', outcomes: { [rustId]: 'ok', [accidentsId]: 'ok' } },
      { type: 'evidence_added', kind: 'receipt', itemIds: [beltId], outcome: 'supports', note: 'Belt receipt 90 000 km' },
      { type: 'start_contract' },
    );
    expect(item(c, 'mandatory:owner_matches_seller').status).toBe('verified');
    expect(claimItem(c, 'no_rust').status).toBe('verified');
    expect(claimItem(c, 'timing_belt').status).toBe('verified');

    const odoId = claimItem(c, 'odometer').id;
    expect(evaluateGate(c).blockers).toEqual([{ kind: 'contradiction', itemId: odoId }]);
    expect(applyEvent(c, { type: 'mark_ready' }, ctx)).toEqual({ ok: false, error: 'gate_blocked' });

    // The buyer negotiates and knowingly accepts the odometer risk: "Ready, with 1 accepted risk".
    c = apply(c, { type: 'risk_accepted', itemId: odoId });
    const gate = evaluateGate(c);
    expect(gate).toMatchObject({ passes: true, acceptedRisks: 1, staleWarnings: 1 });

    c = apply(c, { type: 'mark_ready' }, { type: 'buy' });
    expect(c.decision?.kind).toBe('buy');

    c = apply(
      c,
      { type: 'handoff_consented', buyer: { ageBand: '20-25', firstTimeDriver: true, coverIntent: 'liability_plus_partial', deductible: eur(300) } },
      { type: 'handoff_quote', monthly: eur(62) },
      { type: 'handoff_bound' },
      { type: 'registered' },
      { type: 'take_ownership' },
    );
    expect(c.status).toBe('owned');
    expect(c.handoff?.payload).toMatchObject({ plate: 'ABC-123', make: 'Volkswagen', modelYear: 2012, buyerAgeBand: '20-25' });
    expect(c.handoff?.ownershipNotificationBy).toBe('2026-10-24T10:00:00.000Z');
    expect(JSON.stringify(c.handoff)).not.toMatch(/income|savings|Mikko/i);

    const reminders = remindersFor(c, NOW, 'en');
    expect(reminders.map((r) => r.kind)).toEqual(['inspection', 'tyre_change', 'insurance_renewal', 'service', 'vehicle_tax']);
    expect(reminders[0]!.dueAt.slice(0, 10)).toBe('2027-03-17'); // two weeks before 31.3.2027
    expect(reminders[1]!.dueAt.slice(0, 10)).toBe('2027-04-15'); // 15.10.2026 has passed

    const text = contractText(c.clauses, 'Contract', 'Draft');
    expect(text).toContain('Volkswagen Golf 2012');
    expect(text).toContain('6 900 €');
  });
});

describe('gate and red flags', () => {
  it('finance-company owner is a blocking red flag that cannot be accepted', () => {
    const c = apply(newCase('octavia-finance'), { type: 'claims_confirmed' }, { type: 'registry_result', registry: registry('FIN-456') });
    const fin = item(c, 'mandatory:not_finance_owned');
    expect(fin.status).toBe('not_verified');
    expect(fin.findings[0]?.blocking).toBe(true);
    expect(applyEvent(c, { type: 'risk_accepted', itemId: fin.id }, ctx)).toEqual({ ok: false, error: 'risk_not_acceptable' });
    expect(evaluateGate(c).blockers).toContainEqual({ kind: 'red_flag', itemId: fin.id });
  });

  it('scam pattern blocks from the start', () => {
    const c = apply(newCase('passat-scam'), { type: 'claims_confirmed' });
    const scam = claimItem(c, 'seller_situation');
    expect(scam.status).toBe('not_verified');
    expect(renderFinding(scam.findings[0]!, 'fi')).toMatch(/huijausta/);
  });

  it('unpaid tax is a non-blocking red flag that must be resolved or accepted', () => {
    const c = apply(newCase('focus-tax'), { type: 'claims_confirmed' }, { type: 'registry_result', registry: registry('GHI-321') });
    const tax = item(c, 'mandatory:vehicle_tax_paid');
    expect(tax.status).toBe('not_verified');
    expect(evaluateGate(c).blockers).toContainEqual({ kind: 'unresolved', itemId: tax.id });
    const accepted = apply(c, { type: 'risk_accepted', itemId: tax.id });
    expect(evaluateGate(accepted).blockers).not.toContainEqual({ kind: 'unresolved', itemId: tax.id });
    expect(accepted.clauses.some((cl) => cl.kind === 'disclosed_defects')).toBe(true);
  });

  it('owner name mismatch and VIN mismatch are blocking', () => {
    const c = apply(
      newCase('corolla-clean'),
      { type: 'claims_confirmed' },
      { type: 'registry_result', registry: registry('XYZ-789') },
      { type: 'owner_compared', sellerNameFromId: 'Someone Else' },
      { type: 'vin_confirmed', matches: false },
    );
    expect(item(c, 'mandatory:owner_matches_seller').findings[0]?.code).toBe('owner_not_seller');
    expect(item(c, 'mandatory:vin_matches').findings[0]?.code).toBe('vin_mismatch');
    expect(evaluateGate(c).blockers.filter((b) => b.kind === 'red_flag')).toHaveLength(2);
  });

  it('a seller statement never verifies anything', () => {
    const c = apply(newCase('corolla-clean'), { type: 'claims_confirmed' });
    const odo = claimItem(c, 'odometer');
    const after = apply(c, { type: 'evidence_added', kind: 'seller_message', itemIds: [odo.id], outcome: 'supports' });
    expect(claimItem(after, 'odometer').status).toBe('awaiting_evidence');
  });

  it('removing the assurance clause for an unverified critical claim blocks the gate', () => {
    const c = apply(newCase('corolla-clean'), { type: 'claims_confirmed' });
    const accidentsId = claimItem(c, 'no_accidents').id; // needs_inspection, no contradiction
    expect(evaluateGate(c).blockers).not.toContainEqual({ kind: 'missing_assurance', itemId: accidentsId });
    const toggled = apply(c, { type: 'clause_toggled', clauseId: `assurance:${accidentsId}` });
    expect(evaluateGate(toggled).blockers).toContainEqual({ kind: 'missing_assurance', itemId: accidentsId });
  });

  it('a contradiction cannot pass on a contract clause alone', () => {
    const c = apply(newCase('golf-odometer'), { type: 'claims_confirmed' }, { type: 'registry_result', registry: registry('ABC-123') });
    expect(evaluateGate(c).blockers).toContainEqual({ kind: 'contradiction', itemId: claimItem(c, 'odometer').id });
  });

  it('new contradicting evidence after ready_to_buy steps back to contract_prep', () => {
    let c = apply(newCase('corolla-clean'), { type: 'claims_confirmed' }, { type: 'registry_result', registry: registry('XYZ-789') });
    const ids = (type: string) => claimItem(c, type).id;
    c = apply(
      c,
      { type: 'owner_compared', sellerNameFromId: 'Anna Esimerkki' },
      { type: 'vin_confirmed', matches: true },
      { type: 'payment_confirmed', safe: true },
      { type: 'start_inspection' },
      { type: 'test_drive_done' },
      { type: 'inspection_result', outcomes: { [ids('no_accidents')]: 'ok' } },
      { type: 'start_contract' },
      { type: 'mark_ready' },
    );
    expect(c.status).toBe('ready_to_buy');
    const back = apply(c, { type: 'evidence_added', kind: 'inspection_report', itemIds: [ids('no_accidents')], outcome: 'contradicts' });
    expect(back.status).toBe('contract_prep');
  });
});

describe('transition guards', () => {
  const draft = newCase('corolla-clean');

  it('rejects out-of-order events with an explicit error', () => {
    expect(applyEvent(draft, { type: 'buy' }, ctx)).toEqual({ ok: false, error: 'invalid_transition' });
    expect(applyEvent(draft, { type: 'question_asked', itemId: 'x' }, ctx)).toEqual({ ok: false, error: 'ledger_closed' });
    const checking = apply(draft, { type: 'claims_confirmed' });
    expect(applyEvent(checking, { type: 'start_inspection' }, ctx)).toEqual({ ok: false, error: 'registry_missing' });
    expect(applyEvent(checking, { type: 'claim_removed', claimId: 'c1' }, ctx)).toEqual({ ok: false, error: 'claims_locked' });
    expect(applyEvent(checking, { type: 'owner_compared', sellerNameFromId: 'x' }, ctx)).toEqual({ ok: false, error: 'registry_missing' });
    expect(applyEvent(checking, { type: 'evidence_added', kind: 'photo', itemIds: [], outcome: 'supports' }, ctx)).toEqual({ ok: false, error: 'no_items' });
  });

  it('requires the test drive and the recommended inspection before the contract', () => {
    const c = apply(draft, { type: 'claims_confirmed' }, { type: 'registry_result', registry: registry('XYZ-789') }, { type: 'start_inspection' });
    expect(applyEvent(c, { type: 'start_contract' }, ctx)).toEqual({ ok: false, error: 'test_drive_missing' });
    const driven = apply(c, { type: 'test_drive_done' });
    expect(applyEvent(driven, { type: 'start_contract' }, ctx)).toEqual({ ok: false, error: 'inspection_missing' });
  });

  it('supports editing, removing and adding claims during review', () => {
    const c = apply(
      draft,
      { type: 'claim_edited', claimId: 'c1', value: { kind: 'km', km: 150000 } },
      { type: 'claim_removed', claimId: 'c2' },
      { type: 'claim_added', claimType: 'clutch', value: { kind: 'event' }, quote: 'Seller said on the phone' },
    );
    expect(c.claims.find((cl) => cl.id === 'c1')).toMatchObject({ extractor: 'user', value: { kind: 'km', km: 150000 } });
    expect(c.claims.some((cl) => cl.id === 'c2')).toBe(false);
    expect(c.claims.at(-1)).toMatchObject({ id: 'u1', type: 'clutch' });
  });

  it('walks away and reopens', () => {
    const away = apply(draft, { type: 'walk_away' });
    expect(away.status).toBe('walked_away');
    expect(apply(away, { type: 'reopen' }).status).toBe('reviewing_claims');
  });

  it('marks questions as asked', () => {
    const c = apply(draft, { type: 'claims_confirmed' });
    const tyres = claimItem(c, 'tyres_included');
    expect(apply(c, { type: 'question_asked', itemId: tyres.id }).items.find((i) => i.id === tyres.id)?.status).toBe('awaiting_evidence');
  });
});

describe('scenario items for missing claims', () => {
  it('adds a timing-belt item when a belt model does not mention the belt', () => {
    const ad = analyseAd('VW Golf 1.6 TDI 2011, ajettu 150 000 km', { now: NOW, textHash: 'h', inputKind: 'pasted_text' });
    const c = apply(createCase('x', ad, NOW), { type: 'claims_confirmed' });
    const belt = c.items.find((i) => i.id === 'scenario:belt_history_missing')!;
    expect(itemTitle(belt, 'en')).toBe('Timing belt history (not in the ad)');
    expect(c.items.some((i) => i.id === 'scenario:service_history_missing')).toBe(true);
    expect(questionFor(c, belt, 'fi')?.buyerText).toMatch(/jakohihna/i);
  });
});
