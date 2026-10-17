/**
 * Part A ownership budget (§6). Every default is a TEAM ASSUMPTION ⚠️ and carries
 * `isAssumption: true`, so the UI labels it "estimate". Replace with dated FI pack values.
 */
import { addMoney, eur, scaleMoney, toEuros } from './money';
import type {
  AgeBand,
  BudgetLine,
  BuyerProfile,
  CarSpec,
  CoverIntent,
  Density,
  Fuel,
  Money,
  OwnershipBudget,
  Provenance,
  SavingsBuffer,
  Verdict,
} from './types';

const ASSUMPTION: Provenance = { kind: 'default', isAssumption: true, sourceId: 'team-assumptions-2026-10' };

export const DEFAULT_ANNUAL_KM: Record<Density, number> = { urban: 8_000, suburban: 12_000, rural: 16_000 };

/** Indicative yearly premium bands (EUR) for liability + cover intent. Estimate, not a quote. */
export const INSURANCE_YEARLY: Record<AgeBand, number> = { '18-19': 1100, '20-25': 800, '26-34': 550, '35+': 450 };
export const COVER_FACTOR: Record<CoverIntent, number> = { liability_only: 1, liability_plus_partial: 1.25, liability_plus_comprehensive: 1.6 };

export const FIRST_TIME_DRIVER_FACTOR = 1.15;

const CONSUMPTION: Record<Fuel, { per100: number; unitPrice: number }> = {
  petrol: { per100: 6.5, unitPrice: 1.85 }, // l/100 km, €/l
  diesel: { per100: 5.2, unitPrice: 1.75 },
  hybrid: { per100: 4.5, unitPrice: 1.85 },
  phev: { per100: 3.5, unitPrice: 1.85 },
  ev: { per100: 17, unitPrice: 0.18 }, // kWh/100 km, €/kWh incl. home charging
  other: { per100: 7, unitPrice: 1.85 },
};

const PARKING_MONTHLY: Record<Density, number> = { urban: 30, suburban: 0, rural: 0 };
const INSPECTION_YEARLY = 60;
const WINTER_TYRES_ONE_OFF = 600;
const TYRE_CHANGE_MONTHLY = 10;

export const VERDICT_THRESHOLDS = { comfortable: 0.15, manageable: 0.25, tight: 0.35 } as const; // team heuristic ⚠️

function vehicleTaxYearly(car: CarSpec): number {
  const co2 = car.co2GPerKm ?? (car.fuel === 'ev' ? 0 : 140);
  const base = co2 <= 100 ? 110 : co2 <= 150 ? 200 : co2 <= 200 ? 330 : 500;
  // Diesel/EV propulsion tax per started 100 kg ⚠️ approximation
  const mass = car.massKg ?? 1300;
  const propulsion = car.fuel === 'diesel' ? Math.ceil(mass / 100) * 20 : car.fuel === 'ev' ? Math.ceil(mass / 100) * 10 : 0;
  return base + propulsion;
}

function maintenanceMonthly(age: number): number {
  return age <= 5 ? 40 : age <= 10 ? 60 : 80;
}

function repairReserveMonthly(age: number, km: number): number {
  return 30 + (age > 8 ? 30 : 0) + (km > 150_000 ? 30 : 0);
}

const line = (key: BudgetLine['key'], monthlyEur: number, provenance: Provenance, oneOffEur?: number): BudgetLine => ({
  key,
  monthly: eur(monthlyEur),
  ...(oneOffEur ? { oneOff: eur(oneOffEur) } : {}),
  provenance,
});

export interface BudgetInput {
  profile: BuyerProfile;
  car: CarSpec;
  extraOneOffEur?: number; // e.g. timing belt due (from a purchase case)
  now: Date;
}

export function computeBudget({ profile, car, extraOneOffEur = 0, now }: BudgetInput): OwnershipBudget {
  const age = Math.max(0, now.getUTCFullYear() - car.modelYear);
  const km = profile.annualKm ?? DEFAULT_ANNUAL_KM[profile.density];
  const fuel = CONSUMPTION[car.fuel];
  const prov = (field: keyof CarSpec['fieldProvenance']) => car.fieldProvenance[field] ?? ASSUMPTION;

  const lines: BudgetLine[] = [
    line('insurance', (INSURANCE_YEARLY[profile.ageBand] * COVER_FACTOR[profile.coverIntent] * (profile.firstTimeDriver ? FIRST_TIME_DRIVER_FACTOR : 1)) / 12, ASSUMPTION),
    line('energy', (km / 100) * fuel.per100 * fuel.unitPrice / 12, ASSUMPTION),
    line('vehicle_tax', vehicleTaxYearly(car) / 12, car.co2GPerKm ? prov('co2GPerKm') : ASSUMPTION),
    line('parking', PARKING_MONTHLY[profile.density], ASSUMPTION),
    line('maintenance', maintenanceMonthly(age), ASSUMPTION),
    line('tyres', TYRE_CHANGE_MONTHLY, car.hasWinterTyres === undefined ? ASSUMPTION : prov('hasWinterTyres'), car.hasWinterTyres ? undefined : WINTER_TYRES_ONE_OFF),
    line('inspection', INSPECTION_YEARLY / 12, ASSUMPTION),
    line('repair_reserve', repairReserveMonthly(age, car.odometerKm ?? age * 15_000), car.odometerKm ? prov('odometerKm') : ASSUMPTION, extraOneOffEur || undefined),
  ];

  const monthlyTotal = addMoney(...lines.map((l) => l.monthly));
  const oneOffs = addMoney(...lines.map((l) => l.oneOff ?? eur(0)));
  const repairLine = lines.find((l) => l.key === 'repair_reserve')!;

  return {
    car,
    lines,
    monthlyTotal,
    verdict: verdictFor(monthlyTotal, profile.netMonthlyIncome),
    buffer: bufferFor(profile, scaleMoney(repairLine.monthly, 12), monthlyTotal, oneOffs),
    scenarioIds: [],
    computedAt: now.toISOString(),
  };
}

const midpoint = (r: { low: Money; high: Money }) => (toEuros(r.low) + toEuros(r.high)) / 2;

export function verdictFor(monthlyTotal: Money, income?: { low: Money; high: Money }): Verdict {
  if (!income) return { level: 'unknown' };
  const mid = midpoint(income);
  if (mid <= 0) return { level: 'unknown' };
  const share = toEuros(monthlyTotal) / mid;
  const level = share < VERDICT_THRESHOLDS.comfortable ? 'comfortable' : share < VERDICT_THRESHOLDS.manageable ? 'manageable' : share < VERDICT_THRESHOLDS.tight ? 'tight' : 'over_budget';
  return { level, shareOfIncome: share };
}

function bufferFor(profile: BuyerProfile, firstYearRepair: Money, oneMonth: Money, oneOffs: Money): SavingsBuffer {
  const recommended = addMoney(profile.deductible, firstYearRepair, oneMonth, oneOffs);
  return {
    deductible: profile.deductible,
    firstYearRepair,
    oneMonthCosts: oneMonth,
    oneOffs,
    recommended,
    coveredBySavings: profile.savings ? midpoint(profile.savings) >= toEuros(recommended) : undefined,
  };
}

/** Deductible trade-off table: a higher deductible lowers the premium but needs a bigger buffer. */
export const DEDUCTIBLE_OPTIONS_EUR = [150, 300, 500] as const; // typical options ⚠️

export function deductibleTradeoffs(profile: BuyerProfile, budget: OwnershipBudget) {
  const baseDeductible = toEuros(profile.deductible);
  return DEDUCTIBLE_OPTIONS_EUR.map((d) => ({
    deductible: eur(d),
    // ⚠️ assumption: each +€100 deductible saves ~2 % of the comprehensive premium
    premiumDeltaYearlyEur: Math.round(-((d - baseDeductible) / 100) * 0.02 * INSURANCE_YEARLY[profile.ageBand] * COVER_FACTOR[profile.coverIntent]),
    bufferNeeded: eur(toEuros(budget.buffer.recommended) - baseDeductible + d),
  }));
}
