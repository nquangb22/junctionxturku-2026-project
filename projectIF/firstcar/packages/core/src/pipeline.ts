/**
 * Ad intake pipeline (§5): clean → injection scan → redact → rules → (optional LLM) → merge → map quotes to raw.
 * The LLM output is validated here exactly as the extract-claims function would: schema, clamps, grounding.
 */
import { detectInjection, extractWithRules, type Extraction } from './extract-rules';
import { redactAd } from './redact';
import { cleanAdText, findSpan, isGrounded, normaliseForMatch } from './text';
import type { ClaimType, ClaimValue, Confidence, Listing, SellerClaim, SellerType } from './types';

/** The structured output the LLM must return (ExtractionV1 in §5). */
export interface LlmExtractionV1 {
  schemaVersion: 1;
  sellerType: SellerType;
  car: { make?: string; model?: string; modelYear?: number; fuel?: string; priceEur?: number };
  claims: Array<{ type: ClaimType; value: ClaimValue; quote: string; confidence: Confidence }>;
  instructionsAddressedToAI: boolean;
}

const CLAIM_TYPES: ReadonlySet<string> = new Set<ClaimType>([
  'odometer', 'model_year', 'first_registration', 'owners_count', 'imported', 'service_history', 'timing_belt',
  'clutch', 'recent_repair', 'inspection_valid', 'no_rust', 'no_accidents', 'tyres_included', 'keys_count',
  'known_defects', 'seller_situation', 'price', 'other',
]);

const MAX_CLAIMS = 30;
const MAX_KM = 2_000_000;

function clampValue(v: ClaimValue): ClaimValue | undefined {
  switch (v.kind) {
    case 'km':
      return v.km >= 0 && v.km <= MAX_KM ? v : undefined;
    case 'count':
      return Number.isInteger(v.n) && v.n >= 0 && v.n <= 20 ? v : undefined;
    case 'date':
      return /^\d{4}(-\d{2})?$/.test(v.date) ? v : undefined;
    case 'text':
      return { kind: 'text', text: v.text.slice(0, 140) };
    case 'event':
      return v.atKm === undefined || (v.atKm >= 0 && v.atKm <= MAX_KM) ? v : undefined;
    default:
      return v;
  }
}

/**
 * Validates untrusted LLM output against the redacted ad. Drops anything that is not
 * schema-valid or whose quote is not a verbatim span of the text (kills hallucinated and injected claims).
 */
export function validateLlmExtraction(raw: unknown, redactedText: string): { claims: SellerClaim[]; flaggedByModel: boolean } {
  if (typeof raw !== 'object' || raw === null) return { claims: [], flaggedByModel: false };
  const data = raw as Partial<LlmExtractionV1>;
  if (data.schemaVersion !== 1 || !Array.isArray(data.claims)) return { claims: [], flaggedByModel: false };

  const claims: SellerClaim[] = [];
  for (const c of data.claims.slice(0, MAX_CLAIMS)) {
    if (!c || typeof c.quote !== 'string' || !CLAIM_TYPES.has(c.type) || typeof c.value !== 'object') continue;
    if (c.quote.length < 3 || c.quote.length > 200 || !isGrounded(redactedText, c.quote)) continue;
    const value = clampValue(c.value);
    if (!value) continue;
    const span = findSpan(redactedText, c.quote);
    claims.push({
      id: '',
      type: c.type,
      value,
      quote: c.quote,
      quoteStart: span?.start ?? 0,
      extractor: 'llm',
      confidence: c.confidence === 'high' || c.confidence === 'low' ? c.confidence : 'medium',
    });
  }
  return { claims, flaggedByModel: data.instructionsAddressedToAI === true };
}

const sameValue = (a: ClaimValue, b: ClaimValue) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merges rule and LLM claims. Same type + same value collapses to one claim (rules keep the id slot).
 * Two different values for a single-valued type are both kept; the ledger shows the disagreement.
 */
export function mergeClaims(rules: SellerClaim[], llm: SellerClaim[]): SellerClaim[] {
  const merged = [...rules];
  for (const c of llm) {
    const dup = merged.some((m) => m.type === c.type && (sameValue(m.value, c.value) || normaliseForMatch(m.quote) === normaliseForMatch(c.quote)));
    if (!dup) merged.push(c);
  }
  return merged
    .sort((a, b) => a.quoteStart - b.quoteStart)
    .map((c, i) => ({ ...c, id: `c${i + 1}` }));
}

/** Locates each claim's quote in the raw (unredacted) ad so the UI can highlight it. Device-only data. */
export function mapQuotesToRaw(claims: SellerClaim[], rawText: string): SellerClaim[] {
  return claims.map((c) => {
    const span = findSpan(rawText, c.quote);
    return span ? { ...c, rawStart: span.start, rawEnd: span.end } : c;
  });
}

export interface AnalysedAd {
  listing: Listing;
  claims: SellerClaim[];
}

export interface AnalyseOptions {
  now: Date;
  textHash: string; // sha256 of normaliseForMatch(redacted), computed by the caller (expo-crypto)
  inputKind: Listing['inputKind'];
  llm?: unknown; // validated LlmExtractionV1 from cache, mock or the extract-claims function
  llmSource?: 'llm+rules' | 'cache' | 'mock';
}

/** Step 1 of intake, before hashing: returns the redacted text the hash and LLM must use. */
export function prepareAd(raw: string): { cleaned: string; redacted: string; plate?: string; vin?: string; injectionInRaw: boolean } {
  const injectionInRaw = detectInjection(raw);
  const cleaned = cleanAdText(raw);
  const { redacted, plate, vin } = redactAd(cleaned);
  return { cleaned, redacted, plate, vin, injectionInRaw };
}

/** Step 2: rules (+ validated LLM) on the redacted text, merged and mapped back to the raw ad. */
export function analyseAd(raw: string, opts: AnalyseOptions): AnalysedAd {
  const prep = prepareAd(raw);
  const rules: Extraction = extractWithRules(prep.redacted);
  const llm = opts.llm === undefined ? undefined : validateLlmExtraction(opts.llm, prep.redacted);
  const claims = mapQuotesToRaw(mergeClaims(rules.claims, llm?.claims ?? []), prep.cleaned);

  const llmCar = (opts.llm as Partial<LlmExtractionV1> | undefined)?.car;
  const car = { ...rules.car };
  if (llmCar) {
    car.make ??= llmCar.make;
    car.model ??= llmCar.model;
    car.modelYear ??= llmCar.modelYear;
    if (!car.price && typeof llmCar.priceEur === 'number') car.price = { minor: llmCar.priceEur * 100, currency: 'EUR' };
  }

  const listing: Listing = {
    inputKind: opts.inputKind,
    rawTextLocal: prep.cleaned,
    redactedText: prep.redacted,
    textHash: opts.textHash,
    plateLocal: prep.plate,
    vinLocal: prep.vin,
    sellerType: rules.sellerType !== 'unknown' ? rules.sellerType : ((opts.llm as Partial<LlmExtractionV1> | undefined)?.sellerType ?? 'unknown'),
    car,
    injectionSuspected: prep.injectionInRaw || rules.injectionSuspected || (llm?.flaggedByModel ?? false),
    extractor: llm ? (opts.llmSource ?? 'llm+rules') : 'rules',
    capturedAt: opts.now.toISOString(),
  };
  return { listing, claims };
}
