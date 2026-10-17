import type { Money } from './types';

export const eur = (euros: number): Money => ({ minor: Math.round(euros * 100), currency: 'EUR' });

export const toEuros = (m: Money): number => m.minor / 100;

export const addMoney = (...items: Money[]): Money =>
  ({ minor: items.reduce((sum, m) => sum + m.minor, 0), currency: 'EUR' });

export const scaleMoney = (m: Money, factor: number): Money =>
  ({ minor: Math.round(m.minor * factor), currency: m.currency });

/** Formats whole euros with a narrow no-break space as thousands separator, e.g. "6 900 €". */
export function formatEur(m: Money): string {
  const euros = Math.round(toEuros(m));
  const grouped = Math.abs(euros).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${euros < 0 ? '−' : ''}${grouped} €`;
}

export const formatKm = (km: number): string =>
  `${Math.round(km).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} km`;
