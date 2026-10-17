import { describe, expect, it } from 'vitest';

import { computeBudget, deductibleTradeoffs, verdictFor } from '../budget';
import { eur, formatEur, toEuros } from '../money';
import { selectScenarios } from '../scenarios';
import type { BuyerProfile, CarSpec } from '../types';

const NOW = new Date('2026-10-17T10:00:00Z');

const profile: BuyerProfile = {
  country: 'FI',
  locale: 'en',
  density: 'urban',
  ageBand: '20-25',
  firstTimeDriver: true,
  netMonthlyIncome: { low: eur(1800), high: eur(2200) },
  savings: { low: eur(500), high: eur(1000) },
  coverIntent: 'liability_plus_partial',
  deductible: eur(300),
};

const golf: CarSpec = { make: 'Volkswagen', model: 'Golf', modelYear: 2012, fuel: 'diesel', odometerKm: 180000, hasWinterTyres: true, fieldProvenance: { odometerKm: { kind: 'ad' } } };

describe('computeBudget', () => {
  const budget = computeBudget({ profile, car: golf, now: NOW });

  it('produces all lines, labels assumptions and keeps ad provenance', () => {
    expect(budget.lines.map((l) => l.key)).toEqual(['insurance', 'energy', 'vehicle_tax', 'parking', 'maintenance', 'tyres', 'inspection', 'repair_reserve']);
    expect(budget.lines.find((l) => l.key === 'insurance')?.provenance.isAssumption).toBe(true);
    expect(budget.lines.find((l) => l.key === 'repair_reserve')?.provenance.kind).toBe('ad');
    expect(toEuros(budget.monthlyTotal)).toBeCloseTo(budget.lines.reduce((s, l) => s + toEuros(l.monthly), 0), 1);
  });

  it('gives a verdict from the income midpoint', () => {
    expect(budget.verdict.shareOfIncome).toBeCloseTo(toEuros(budget.monthlyTotal) / 2000, 5);
    expect(['manageable', 'tight']).toContain(budget.verdict.level);
  });

  it('adds a winter-tyre one-off and an extra belt job to the buffer', () => {
    const noTyres = computeBudget({ profile, car: { ...golf, hasWinterTyres: false }, extraOneOffEur: 800, now: NOW });
    expect(toEuros(noTyres.buffer.oneOffs)).toBe(1400);
    expect(toEuros(noTyres.buffer.recommended)).toBeGreaterThan(toEuros(budget.buffer.recommended));
    expect(noTyres.buffer.coveredBySavings).toBe(false);
  });

  it('works without income: verdict unknown, everything else still shown', () => {
    const b = computeBudget({ profile: { ...profile, netMonthlyIncome: undefined, savings: undefined }, car: golf, now: NOW });
    expect(b.verdict).toEqual({ level: 'unknown' });
    expect(b.buffer.coveredBySavings).toBeUndefined();
    expect(b.lines.length).toBe(8);
  });

  it('gives EVs no fuel-propulsion tax and cheap energy', () => {
    const ev = computeBudget({ profile, car: { ...golf, fuel: 'ev', co2GPerKm: undefined }, now: NOW });
    expect(toEuros(ev.lines.find((l) => l.key === 'energy')!.monthly)).toBeLessThan(toEuros(budget.lines.find((l) => l.key === 'energy')!.monthly));
  });
});

describe('verdictFor thresholds', () => {
  const income = { low: eur(1000), high: eur(1000) };
  it.each([
    [100, 'comfortable'],
    [200, 'manageable'],
    [300, 'tight'],
    [400, 'over_budget'],
  ])('%d € of 1000 € is %s', (monthly, level) => {
    expect(verdictFor(eur(monthly), income).level).toBe(level);
  });

  it('is unknown for a zero income', () => {
    expect(verdictFor(eur(100), { low: eur(0), high: eur(0) }).level).toBe('unknown');
  });
});

describe('deductibleTradeoffs', () => {
  it('higher deductible → lower premium, bigger buffer', () => {
    const rows = deductibleTradeoffs(profile, computeBudget({ profile, car: golf, now: NOW }));
    expect(rows.map((r) => toEuros(r.deductible))).toEqual([150, 300, 500]);
    expect(rows[0]!.premiumDeltaYearlyEur).toBeGreaterThan(0);
    expect(rows[2]!.premiumDeltaYearlyEur).toBeLessThan(0);
    expect(toEuros(rows[2]!.bufferNeeded)).toBeGreaterThan(toEuros(rows[0]!.bufferNeeded));
  });
});

describe('selectScenarios', () => {
  it('keeps at most one per category and at most three', () => {
    const s = selectScenarios(profile, golf, 'en');
    expect(s.length).toBeLessThanOrEqual(3);
    expect(new Set(s.map((x) => x.category)).size).toBe(s.length);
    expect(s[0]?.id).toBe('young_driver_claims');
  });

  it('never shows an invented statistic', () => {
    for (const sc of selectScenarios(profile, golf, 'fi')) {
      if (sc.stat.status === 'pending') expect(sc.stat.value).toBeNull();
    }
  });

  it('shows nothing young-driver related to an experienced 40-year-old', () => {
    const s = selectScenarios({ ...profile, ageBand: '35+', firstTimeDriver: false, density: 'rural', savings: { low: eur(5000), high: eur(6000) } }, undefined, 'en');
    expect(s).toEqual([]);
  });
});

describe('formatEur', () => {
  it('groups thousands and rounds', () => {
    expect(formatEur(eur(6900))).toBe('6 900 €');
    expect(formatEur(eur(-12.4))).toBe('−12 €');
  });
});
