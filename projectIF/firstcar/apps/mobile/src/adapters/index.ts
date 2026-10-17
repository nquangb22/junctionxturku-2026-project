/**
 * Adapters (mock-first build). Each returns data shaped exactly like the real integration would,
 * so swapping in Supabase `extract-claims`, Traficom and If later changes no screen code.
 */
import {
  COVER_FACTOR,
  DEMO_ADS,
  FIRST_TIME_DRIVER_FACTOR,
  INSURANCE_YEARLY,
  MOCK_PLATES,
  MOCK_REGISTRY,
  analyseAd,
  normaliseForMatch,
  prepareAd,
  type AnalysedAd,
  type InsuranceHandoff,
  type Listing,
  type Money,
  type RegistryCheck,
} from '@firstcar/core';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

import { callFunction, isBackendConfigured } from './backend';

const MOCK_LATENCY_MS = 600;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- extraction ---------- */

export interface ExtractionOptions {
  useMockLlm: boolean;
  inputKind: Listing['inputKind'];
  now: Date;
}

interface ExtractClaimsResponse {
  llm: unknown;
  source: 'llm' | 'cache' | 'unavailable';
  injectionSuspected: boolean;
}

/**
 * Live LLM claims from the `extract-claims` function. Undefined means rules-only. The backend is optional, so
 * every failure (offline, limit hit, gateway error, storage error) falls back instead of failing the intake.
 */
async function liveExtraction(redacted: string): Promise<{ llm: unknown; llmSource: 'llm+rules' | 'cache' } | undefined> {
  if (!isBackendConfigured()) return undefined;
  try {
    const res = await callFunction<ExtractClaimsResponse>('extract-claims', { redactedText: redacted, schemaVersion: 1, country: 'FI' });
    if (res.source === 'unavailable' || res.llm === null) return undefined;
    return { llm: res.llm, llmSource: res.source === 'cache' ? 'cache' : 'llm+rules' };
  } catch (err) {
    console.warn('extract-claims unavailable, using on-device rules', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

/**
 * Rules run on the device. In mock mode, ads that match a demo fixture also get the fixture's
 * "LLM" output. With mock mode off and a backend configured, only the redacted text goes to `extract-claims`.
 * Either way the LLM output goes through the same validation (schema, clamps, quote grounding).
 */
export async function extractClaims(raw: string, opts: ExtractionOptions): Promise<AnalysedAd> {
  const { redacted } = prepareAd(raw);
  const key = normaliseForMatch(redacted);
  const textHash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, key);
  if (!opts.useMockLlm) {
    const live = await liveExtraction(redacted);
    return analyseAd(raw, { now: opts.now, textHash, inputKind: opts.inputKind, llm: live?.llm, llmSource: live?.llmSource });
  }
  const fixture = DEMO_ADS.find((a) => normaliseForMatch(prepareAd(a.text).redacted) === key);
  if (fixture) await wait(MOCK_LATENCY_MS);
  return analyseAd(raw, { now: opts.now, textHash, inputKind: opts.inputKind, llm: fixture?.llm, llmSource: fixture ? 'mock' : undefined });
}

/* ---------- registry (traficom-mock) ---------- */

export const normalisePlate = (plate: string) => plate.trim().toUpperCase().replace(/\s+/g, '').replace(/^([A-ZÅÄÖ]{2,3})(\d{1,3})$/, '$1-$2');

export type RegistryLookup = { ok: true; registry: RegistryCheck } | { ok: false; reason: 'unknown_plate'; demoPlates: string[] };

export async function lookupRegistry(plate: string, now: Date): Promise<RegistryLookup> {
  await wait(MOCK_LATENCY_MS);
  const record = MOCK_REGISTRY[normalisePlate(plate)];
  if (!record) return { ok: false, reason: 'unknown_plate', demoPlates: MOCK_PLATES };
  return { ok: true, registry: { ...record, fetchedAt: now.toISOString() } };
}

/* ---------- If hand-off (if-mock) ---------- */

/** Demo quote. Uses only the consented payload: nothing else is available to the insurer. */
export async function requestQuote(payload: InsuranceHandoff['payload']): Promise<Money> {
  await wait(MOCK_LATENCY_MS);
  const yearly = INSURANCE_YEARLY[payload.buyerAgeBand] * COVER_FACTOR[payload.coverIntent] * (payload.firstTimeDriver ? FIRST_TIME_DRIVER_FACTOR : 1);
  return { minor: Math.round((yearly / 12) * 100), currency: 'EUR' };
}

export async function bindPolicy(): Promise<void> {
  await wait(MOCK_LATENCY_MS);
}

export async function fileOwnershipChange(): Promise<void> {
  await wait(MOCK_LATENCY_MS);
}
