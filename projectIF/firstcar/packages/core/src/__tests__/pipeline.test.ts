import { describe, expect, it } from 'vitest';

import { DEMO_ADS } from '../fixtures';
import { analyseAd, mergeClaims, prepareAd, validateLlmExtraction } from '../pipeline';
import type { SellerClaim } from '../types';

const NOW = new Date('2026-10-17T10:00:00Z');
const golf = DEMO_ADS.find((a) => a.id === 'golf-odometer')!;

describe('validateLlmExtraction', () => {
  it('drops claims whose quote is not in the ad (hallucination)', () => {
    const { redacted } = prepareAd(golf.text);
    const { claims } = validateLlmExtraction(golf.llm, redacted);
    expect(claims.map((c) => c.type)).toEqual(['odometer', 'timing_belt', 'recent_repair']);
    expect(claims.some((c) => c.type === 'clutch')).toBe(false);
  });

  it('every fixture LLM claim except the deliberate hallucination is grounded', () => {
    for (const a of DEMO_ADS) {
      const { redacted } = prepareAd(a.text);
      const kept = validateLlmExtraction(a.llm, redacted).claims.length;
      const expected = a.llm.claims.length - (a.id === 'golf-odometer' ? 1 : 0);
      expect(kept, a.id).toBe(expected);
    }
  });

  it('rejects malformed output and out-of-range values', () => {
    expect(validateLlmExtraction(null, 'x').claims).toEqual([]);
    expect(validateLlmExtraction({ schemaVersion: 2, claims: [] }, 'x').claims).toEqual([]);
    const text = 'Ajettu 9 999 999 km';
    const out = validateLlmExtraction(
      { schemaVersion: 1, claims: [{ type: 'odometer', value: { kind: 'km', km: 9_999_999 }, quote: 'Ajettu 9 999 999 km', confidence: 'high' }, { type: 'nonsense', value: { kind: 'bool', value: true }, quote: 'Ajettu', confidence: 'high' }] },
      text,
    );
    expect(out.claims).toEqual([]);
  });

  it('passes through the model\'s own injection flag', () => {
    const inj = DEMO_ADS.find((a) => a.id === 'golf-injection')!;
    expect(validateLlmExtraction(inj.llm, prepareAd(inj.text).redacted).flaggedByModel).toBe(true);
  });
});

describe('mergeClaims', () => {
  const claim = (over: Partial<SellerClaim>): SellerClaim => ({ id: 'x', type: 'odometer', value: { kind: 'km', km: 1 }, quote: 'q1', quoteStart: 0, extractor: 'rules', confidence: 'high', ...over });

  it('collapses duplicates and keeps disagreements, re-numbering in text order', () => {
    const merged = mergeClaims(
      [claim({ quoteStart: 10, value: { kind: 'km', km: 180000 }, quote: 'Ajettu 180 000 km' })],
      [
        claim({ quoteStart: 10, value: { kind: 'km', km: 180000 }, quote: 'ajettu 180 000 km', extractor: 'llm' }),
        claim({ quoteStart: 50, value: { kind: 'km', km: 210000 }, quote: 'oikeasti 210 000 km', extractor: 'llm' }),
        claim({ quoteStart: 0, type: 'no_rust', value: { kind: 'bool', value: true }, quote: 'ei ruostetta', extractor: 'llm' }),
      ],
    );
    expect(merged.map((c) => [c.id, c.type])).toEqual([['c1', 'no_rust'], ['c2', 'odometer'], ['c3', 'odometer']]);
  });
});

describe('analyseAd', () => {
  it('builds a listing with device-only data and raw quote offsets', () => {
    const { listing, claims } = analyseAd(golf.text, { now: NOW, textHash: 'h', inputKind: 'demo_fixture', llm: golf.llm, llmSource: 'mock' });
    expect(listing.plateLocal).toBe('ABC-123');
    expect(listing.redactedText).not.toContain('Mikko');
    expect(listing.redactedText).not.toContain('040');
    expect(listing.extractor).toBe('mock');
    expect(listing.injectionSuspected).toBe(false);
    const recent = claims.find((c) => c.type === 'recent_repair')!;
    expect(listing.rawTextLocal.slice(recent.rawStart, recent.rawEnd)).toBe('Uudet jarrupalat edessä');
  });

  it('falls back to rules-only and flags injection from the raw text', () => {
    const inj = DEMO_ADS.find((a) => a.id === 'golf-injection')!;
    const { listing, claims } = analyseAd(inj.text, { now: NOW, textHash: 'h', inputKind: 'pasted_text' });
    expect(listing.extractor).toBe('rules');
    expect(listing.injectionSuspected).toBe(true);
    expect(claims.find((c) => c.type === 'odometer')?.value).toEqual({ kind: 'km', km: 132000 });
  });

  it('uses LLM car fields only where rules found nothing', () => {
    const { listing } = analyseAd('Hieno auto, ajettu 100 000 km', {
      now: NOW,
      textHash: 'h',
      inputKind: 'pasted_text',
      llm: { schemaVersion: 1, sellerType: 'dealer', car: { make: 'Kia', model: 'Ceed', modelYear: 2018, priceEur: 9000 }, claims: [], instructionsAddressedToAI: false },
    });
    expect(listing.car).toMatchObject({ make: 'Kia', model: 'Ceed', modelYear: 2018, odometerKm: 100000 });
    expect(listing.car.price).toEqual({ minor: 900000, currency: 'EUR' });
    expect(listing.sellerType).toBe('dealer');
  });
});
