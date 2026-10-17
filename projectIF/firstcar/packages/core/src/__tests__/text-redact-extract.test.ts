import { describe, expect, it } from 'vitest';

import { DEMO_ADS } from '../fixtures';
import { detectInjection, extractWithRules } from '../extract-rules';
import { redactAd } from '../redact';
import { cleanAdText, findSpan, isGrounded, MAX_AD_CHARS, normaliseForMatch, parseGroupedNumber, toKm } from '../text';
import type { SellerClaim } from '../types';

const ad = (id: string) => DEMO_ADS.find((a) => a.id === id)!.text;
const byType = (claims: SellerClaim[], type: SellerClaim['type']) => claims.find((c) => c.type === type);

describe('text helpers', () => {
  it('parses grouped numbers and rejects junk', () => {
    expect(parseGroupedNumber('180 000')).toBe(180000);
    expect(parseGroupedNumber('180.000')).toBe(180000);
    expect(parseGroupedNumber('12a')).toBeUndefined();
  });

  it('converts tkm and Swedish mil to km', () => {
    expect(toKm(90, 'tkm')).toBe(90000);
    expect(toKm(18000, 'mil')).toBe(180000);
    expect(toKm(5000, 'km')).toBe(5000);
  });

  it('caps and cleans pasted text', () => {
    const cleaned = cleanAdText(`a​b\r\n${'x'.repeat(MAX_AD_CHARS + 10)}`);
    expect(cleaned.startsWith('ab\n')).toBe(true);
    expect(cleaned.length).toBe(MAX_AD_CHARS);
  });

  it('finds a redacted quote in the raw text', () => {
    const raw = 'Soita Mikko 040 123 4567 heti';
    const span = findSpan(raw, 'Soita [NAME] [PHONE] heti');
    expect(span).toEqual({ start: 0, end: raw.length });
  });

  it('grounds quotes case- and whitespace-insensitively', () => {
    expect(isGrounded('Ajettu   180 000 km', 'ajettu 180 000 KM')).toBe(true);
    expect(isGrounded('Ajettu 180 000 km', 'Kytkin uusittu')).toBe(false);
    expect(isGrounded('abc', 'ab')).toBe(false); // too short to count
    expect(normaliseForMatch(' A B ')).toBe('a b');
  });
});

describe('redactAd', () => {
  it('removes phone, email, plate, VIN and names but keeps plate and VIN locally', () => {
    const r = redactAd('Rek ABC-123, VIN WVWZZZ1KZCW000001. Soita Mikko 040 123 4567 tai mikko@example.com');
    expect(r.redacted).toBe('Rek [PLATE], VIN [VIN]. Soita [NAME] [PHONE] tai [EMAIL]');
    expect(r.plate).toBe('ABC-123');
    expect(r.vin).toBe('WVWZZZ1KZCW000001');
    expect(r.counts).toEqual({ PHONE: 1, EMAIL: 1, PLATE: 1, VIN: 1, NAME: 1 });
  });

  it('does not redact mileage, prices or engine codes', () => {
    const text = 'Golf 1.6 TDI 105, ajettu 180 000 km, hinta 6 900 €, katsastettu 03/2026';
    expect(redactAd(text).redacted).toBe(text);
  });

  it('does not treat lower-case words after keywords as names', () => {
    expect(redactAd('soita heti').redacted).toBe('soita heti');
  });
});

describe('extractWithRules', () => {
  it('extracts the hero Golf claims with verbatim quotes', () => {
    const text = redactAd(ad('golf-odometer')).redacted;
    const { claims, car, sellerType } = extractWithRules(text);

    expect(byType(claims, 'odometer')?.value).toEqual({ kind: 'km', km: 180000 });
    expect(byType(claims, 'timing_belt')?.value).toEqual({ kind: 'event', atKm: 90000 });
    expect(byType(claims, 'inspection_valid')?.value).toEqual({ kind: 'date', date: '2026-03' });
    expect(byType(claims, 'owners_count')?.value).toEqual({ kind: 'count', n: 1 });
    expect(byType(claims, 'keys_count')?.value).toEqual({ kind: 'count', n: 2 });
    for (const t of ['service_history', 'no_rust', 'no_accidents', 'tyres_included'] as const) {
      expect(byType(claims, t), t).toBeDefined();
    }
    expect(byType(claims, 'seller_situation')).toBeUndefined(); // "muutan ulkomaille" is not a scam
    for (const c of claims) expect(text.slice(c.quoteStart, c.quoteStart + c.quote.length)).toBe(c.quote);
    expect(claims.map((c) => c.id)).toEqual(claims.map((_, i) => `c${i + 1}`));

    expect(car).toMatchObject({ make: 'Volkswagen', model: 'Golf', modelYear: 2012, fuel: 'diesel', odometerKm: 180000, hasWinterTyres: true });
    expect(car.price).toEqual({ minor: 690000, currency: 'EUR' });
    expect(sellerType).toBe('private');
  });

  it('converts Swedish mil before creating the odometer claim', () => {
    const { claims } = extractWithRules('Volvo V70 2010, miltal 18 000 mil, servicebok finns');
    expect(byType(claims, 'odometer')?.value).toEqual({ kind: 'km', km: 180000 });
    expect(byType(claims, 'service_history')).toBeDefined();
  });

  it('flags scam patterns as seller_situation claims', () => {
    const { claims } = extractWithRules(ad('passat-scam'));
    expect(byType(claims, 'seller_situation')?.quote).toMatch(/ulkomailla/i);
  });

  it('detects injection text and zero-width runs', () => {
    expect(detectInjection(ad('golf-injection'))).toBe(true);
    expect(detectInjection('a​​b')).toBe(true);
    expect(detectInjection(ad('corolla-clean'))).toBe(false);
  });

  it('detects dealers and handles ads without a mileage keyword', () => {
    const r = extractWithRules('Skoda Octavia 2016 vaihto ok, 165 000 km');
    expect(r.sellerType).toBe('dealer');
    expect(byType(r.claims, 'odometer')?.confidence).toBe('medium');
  });

  it('returns no claims for empty text', () => {
    expect(extractWithRules('').claims).toEqual([]);
  });
});
