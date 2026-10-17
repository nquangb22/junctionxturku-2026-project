/**
 * Ad intake pipeline (§5): clean → injection scan → redact → rules → (optional LLM) → merge → map quotes to raw.
 * The LLM output is validated here exactly as the extract-claims function would: schema, clamps, grounding.
 */
import { detectInjection, extractWithRules, type Extraction } from './extract-rules';
import { redactAd } from './redact';
import { cleanAdText, findSpan, isGrounded, normaliseForMatch } from './text';
import type { ClaimType, ClaimValue, Confidence, Listing, SellerClaim, SellerType } from './types';
import { withQuoteTranslation } from './translate';

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

const MAX_TEXT = 140;
const MAX_NAME = 60;
const ENUM_VALUES: ReadonlySet<string> = new Set(['full', 'mentioned', 'partial']);
const MIN_MODEL_YEAR = 1950;
const MAX_PRICE_EUR = 10_000_000;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isKm = (v: unknown): v is number => isNum(v) && v >= 0 && v <= MAX_KM;

/** Strictly validates one untrusted claim value; returns undefined for anything malformed. */
function clampValue(v: unknown): ClaimValue | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  switch (o.kind) {
    case 'km':
      return isKm(o.km) ? { kind: 'km', km: o.km } : undefined;
    case 'count':
      return isNum(o.n) && Number.isInteger(o.n) && o.n >= 0 && o.n <= 20 ? { kind: 'count', n: o.n } : undefined;
    case 'date':
      return typeof o.date === 'string' && /^\d{4}(-\d{2})?$/.test(o.date) ? { kind: 'date', date: o.date } : undefined;
    case 'text':
      return typeof o.text === 'string' ? { kind: 'text', text: o.text.slice(0, MAX_TEXT) } : undefined;
    case 'bool':
      return typeof o.value === 'boolean' ? { kind: 'bool', value: o.value } : undefined;
    case 'enum':
      return typeof o.value === 'string' && ENUM_VALUES.has(o.value) ? { kind: 'enum', value: o.value } : undefined;
    case 'money':
      return isNum(o.eur) && o.eur > 0 && o.eur <= MAX_PRICE_EUR ? { kind: 'money', eur: o.eur } : undefined;
    case 'event': {
      if (o.atKm !== undefined && !isKm(o.atKm)) return undefined;
      if (o.atDate !== undefined && !(typeof o.atDate === 'string' && /^\d{4}(-\d{2}){0,2}$/.test(o.atDate))) return undefined;
      return { kind: 'event', ...(o.atKm !== undefined && { atKm: o.atKm }), ...(o.atDate !== undefined && { atDate: o.atDate }) };
    }
    default:
      return undefined;
  }
}

/** Car fields from untrusted LLM output; invalid fields are dropped. */
export function sanitiseLlmCar(raw: unknown, now: Date): LlmExtractionV1['car'] {
  if (typeof raw !== 'object' || raw === null) return {};
  const o = raw as Record<string, unknown>;
  const name = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_NAME) : undefined);
  const year = o.modelYear;
  const price = o.priceEur;
  return {
    make: name(o.make),
    model: name(o.model),
    modelYear: isNum(year) && Number.isInteger(year) && year >= MIN_MODEL_YEAR && year <= now.getUTCFullYear() + 1 ? year : undefined,
    priceEur: isNum(price) && price > 0 && price <= MAX_PRICE_EUR ? price : undefined,
  };
}

const QUOTE_NUMBER = /\d{1,3}(?:[ .  ]\d{3})+|\d+/g;

/**
 * A grounded quote can still carry a made-up number ("Ajettu 250 000 km" with km: 50000).
 * Kilometres and euros must appear in their own quote, as written or as tkm (×1000) / Swedish mil (×10).
 */
export function numberMatchesQuote(value: ClaimValue, quote: string): boolean {
  const km = value.kind === 'km' ? value.km : value.kind === 'event' ? value.atKm : undefined;
  const target = km ?? (value.kind === 'money' ? value.eur : undefined);
  if (target === undefined) return true;
  const numbers = (quote.match(QUOTE_NUMBER) ?? []).map((n) => Number(n.replace(/\D/g, '')));
  const scales = km !== undefined ? [1, 1000, 10] : [1];
  return numbers.some((n) => scales.some((s) => n * s === target));
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
    if (!value || !numberMatchesQuote(value, c.quote)) continue;
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

const SELLER_TYPES: ReadonlySet<string> = new Set<SellerType>(['private', 'dealer', 'unknown']);

function llmSellerType(raw: unknown): SellerType {
  const t = typeof raw === 'object' && raw !== null ? (raw as Partial<LlmExtractionV1>).sellerType : undefined;
  return typeof t === 'string' && SELLER_TYPES.has(t) ? t : 'unknown';
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

  const llmCar = opts.llm === undefined ? undefined : sanitiseLlmCar((opts.llm as Partial<LlmExtractionV1> | null)?.car, opts.now);
  const car = { ...rules.car };
  if (llmCar) {
    car.make ??= llmCar.make;
    car.model ??= llmCar.model;
    car.modelYear ??= llmCar.modelYear;
    if (!car.price && llmCar.priceEur !== undefined) car.price = { minor: Math.round(llmCar.priceEur * 100), currency: 'EUR' };
  }

  const listing: Listing = {
    inputKind: opts.inputKind,
    rawTextLocal: prep.cleaned,
    redactedText: prep.redacted,
    textHash: opts.textHash,
    plateLocal: prep.plate,
    vinLocal: prep.vin,
    sellerType: rules.sellerType !== 'unknown' ? rules.sellerType : llmSellerType(opts.llm),
    car,
    injectionSuspected: prep.injectionInRaw || rules.injectionSuspected || (llm?.flaggedByModel ?? false),
    extractor: llm ? (opts.llmSource ?? 'llm+rules') : 'rules',
    capturedAt: opts.now.toISOString(),
  };
  return { listing, claims: claims.map(withQuoteTranslation) };
}
