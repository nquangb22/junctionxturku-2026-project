import { describe, expect, it } from 'vitest';

import { extractWithRules } from '../extract-rules';
import { numberMatchesQuote, validateLlmExtraction } from '../pipeline';

describe('price rule on whitespace-padded ads', () => {
  it('stays fast on long blank runs (no cubic backtracking)', () => {
    const padded = `Golf 2012${' '.repeat(4000)}${'\n'.repeat(3000)}Hinta: 6 900 €`;
    const start = Date.now();
    const result = extractWithRules(padded);
    expect(Date.now() - start).toBeLessThan(500);
    expect(result.claims.find((c) => c.type === 'price')?.value).toEqual({ kind: 'money', eur: 6900 });
  });

  it('still reads prices with and without a keyword', () => {
    const price = (text: string) => extractWithRules(text).claims.find((c) => c.type === 'price')?.value;
    expect(price('Hinta: 8 900 €')).toEqual({ kind: 'money', eur: 8900 });
    expect(price('price 12000 eur')).toEqual({ kind: 'money', eur: 12000 });
    expect(price('Pyydän 4500 euroa')).toEqual({ kind: 'money', eur: 4500 });
  });
});

describe('LLM values must match the numbers in their own quote', () => {
  it('accepts km as written, in tkm and in Swedish mil, and euros as written', () => {
    expect(numberMatchesQuote({ kind: 'km', km: 180000 }, 'Ajettu 180 000 km')).toBe(true);
    expect(numberMatchesQuote({ kind: 'event', atKm: 90000 }, 'Jakohihna vaihdettu 90 tkm')).toBe(true);
    expect(numberMatchesQuote({ kind: 'km', km: 180000 }, 'Mätarställning 18 000 mil')).toBe(true);
    expect(numberMatchesQuote({ kind: 'money', eur: 6900 }, 'Hinta 6 900 €')).toBe(true);
    expect(numberMatchesQuote({ kind: 'bool', value: true }, 'Kolariton')).toBe(true);
  });

  it('rejects a number the quote does not contain', () => {
    expect(numberMatchesQuote({ kind: 'km', km: 50000 }, 'Ajettu 250 000 km')).toBe(false);
    expect(numberMatchesQuote({ kind: 'money', eur: 900 }, 'Hinta 6 900 €')).toBe(false);
    expect(numberMatchesQuote({ kind: 'event', atKm: 150000 }, 'Jakohihna vaihdettu')).toBe(false);
  });

  it('drops a grounded quote carrying a falsified odometer', () => {
    const { claims } = validateLlmExtraction(
      {
        schemaVersion: 1,
        claims: [{ type: 'odometer', value: { kind: 'km', km: 50000 }, quote: 'Ajettu 250 000 km', confidence: 'high' }],
        instructionsAddressedToAI: false,
      },
      'Golf 2012. Ajettu 250 000 km.',
    );
    expect(claims).toEqual([]);
  });
});
