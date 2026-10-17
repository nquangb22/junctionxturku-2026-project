/**
 * Mileage gap: what it means when the registry odometer is higher than the ad says.
 * An odometer cannot legally go down, so the registry reading is the floor for the real mileage.
 */
import { findModelNote } from './content';
import { eur } from './money';
import type { Money, PurchaseCase } from './types';

/** Team assumption: value lost per extra km. Older cars lose less per km. */
export const VALUE_PER_KM_EUR = { under10y: 0.08, over10y: 0.04 } as const;

export interface MaintenanceDue {
  kind: 'timing_belt';
  dueAtKm: number;
  cost: Money;
}

export interface MileageGap {
  adKm: number;
  registryKm: number;
  diffKm: number;
  /** Difference as a whole percentage of the ad mileage. */
  pct: number;
  eurPerKm: number;
  valueImpact: Money;
  /** Work the real mileage makes due that the ad mileage did not. */
  maintenanceDue: MaintenanceDue[];
  total: Money;
}

/** undefined unless the ad states a mileage and the registry recorded a higher one. */
export function mileageGap(c: PurchaseCase, now: Date): MileageGap | undefined {
  const adKm = c.listing.car.odometerKm;
  const registryKm = c.registry?.inspection?.odometerKmAtLast;
  if (adKm === undefined || registryKm === undefined || registryKm <= adKm) return undefined;

  const diffKm = registryKm - adKm;
  const year = c.listing.car.modelYear ?? c.registry?.technical?.modelYear;
  const eurPerKm = year !== undefined && now.getUTCFullYear() - year < 10 ? VALUE_PER_KM_EUR.under10y : VALUE_PER_KM_EUR.over10y;
  const valueImpact = eur(Math.round(diffKm * eurPerKm));

  const maintenanceDue: MaintenanceDue[] = [];
  const note = findModelNote(c.listing.car.make, c.listing.car.model);
  if (note?.hasTimingBelt && note.beltIntervalKm) {
    const beltClaim = c.claims.find((cl) => cl.type === 'timing_belt');
    const lastKm = beltClaim?.value.kind === 'event' ? beltClaim.value.atKm : undefined;
    if (lastKm !== undefined) {
      const dueAtKm = lastKm + note.beltIntervalKm;
      if (adKm < dueAtKm && dueAtKm <= registryKm) maintenanceDue.push({ kind: 'timing_belt', dueAtKm, cost: eur(note.beltJobEur ?? 0) });
    }
  }

  const total = { minor: valueImpact.minor + maintenanceDue.reduce((sum, m) => sum + m.cost.minor, 0), currency: 'EUR' as const };
  return { adKm, registryKm, diffKm, pct: Math.round((diffKm / adKm) * 100), eurPerKm, valueImpact, maintenanceDue, total };
}
