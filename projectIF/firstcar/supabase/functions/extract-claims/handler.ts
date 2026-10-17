/**
 * POST /extract-claims (§5). Input: the redacted ad text the device produced. Output: a validated
 * ExtractionV1 the device merges with its own rule results, or `llm: null` so the device stays rules-only.
 *
 * The server never trusts the device's redaction or hash: it redacts again and computes its own cache key,
 * so one client cannot poison the cache entry for another ad.
 */
import { type Authenticator, deviceBucket } from '../_shared/auth.ts';
import {
  cleanAdText,
  detectInjection,
  MAX_AD_CHARS,
  normaliseForMatch,
  redactAd,
  sanitiseLlmCar,
  validateLlmExtraction,
  type LlmExtractionV1,
  type SellerType,
} from '../_shared/core/index.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { fail, HttpError, ok, preflight, readJsonObject, withErrors } from '../_shared/http.ts';
import { type BackendStore, type CacheKey, countEvent } from '../_shared/store.ts';
import { type LlmExtractor, LlmUnavailableError } from './llm.ts';

export const SCHEMA_VERSION = 1;
export const DEVICE_LIMIT_PER_DAY = 20;
export const GLOBAL_LLM_LIMIT_PER_DAY = 2000;
const DAY_SECONDS = 24 * 3600;
const MAX_BODY_BYTES = 64 * 1024;
// Redaction tokens such as [PHONE] are longer than what they replace, so device-redacted text can exceed
// MAX_AD_CHARS. Accept some headroom; cleanAdText then truncates to MAX_AD_CHARS.
const MAX_INPUT_CHARS = MAX_AD_CHARS * 2;
const COUNTRIES = new Set(['FI', 'SE', 'NO', 'DK']);
const SELLER_TYPES = new Set<string>(['private', 'dealer', 'unknown']);
const FN = 'extract-claims';

export type ExtractionSource = 'llm' | 'cache' | 'unavailable';

export interface ExtractClaimsResult {
  llm: LlmExtractionV1 | null;
  source: ExtractionSource;
  injectionSuspected: boolean;
}

export interface ExtractClaimsDeps {
  auth: Authenticator;
  store: BackendStore;
  llm: LlmExtractor;
  now?: () => Date;
}

function parseRedactedText(body: Record<string, unknown>): string {
  const { redactedText, schemaVersion, country } = body;
  if (schemaVersion !== SCHEMA_VERSION) throw new HttpError('bad_request', `schemaVersion must be ${SCHEMA_VERSION}.`);
  if (typeof country !== 'string' || !COUNTRIES.has(country)) throw new HttpError('bad_request', 'country must be FI, SE, NO or DK.');
  if (typeof redactedText !== 'string' || redactedText.trim().length === 0) throw new HttpError('bad_request', 'redactedText is required.');
  if (redactedText.length > MAX_INPUT_CHARS) throw new HttpError('payload_too_large', `redactedText is limited to ${MAX_INPUT_CHARS} characters.`);
  return redactedText;
}

/** Rebuilds a clean ExtractionV1 from untrusted model output: only grounded, clamped claims survive. */
export function sanitiseExtraction(raw: unknown, redactedText: string, now: Date): LlmExtractionV1 {
  const { claims, flaggedByModel } = validateLlmExtraction(raw, redactedText);
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const sellerType = typeof o.sellerType === 'string' && SELLER_TYPES.has(o.sellerType) ? (o.sellerType as SellerType) : 'unknown';
  return {
    schemaVersion: 1,
    sellerType,
    car: sanitiseLlmCar(o.car, now),
    claims: claims.map(({ type, value, quote, confidence }) => ({ type, value, quote, confidence })),
    instructionsAddressedToAI: flaggedByModel,
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The cache saves money but is not required: a database hiccup must not throw away a paid LLM answer. */
async function readCache(store: BackendStore, key: CacheKey): Promise<Record<string, unknown> | undefined> {
  try {
    return await store.getCachedExtraction(key);
  } catch (err) {
    console.error(`[${FN}] cache read failed`, errorText(err));
    return undefined;
  }
}

async function writeCache(store: BackendStore, key: CacheKey, result: LlmExtractionV1): Promise<void> {
  try {
    await store.putCachedExtraction(key, result as unknown as Record<string, unknown>);
  } catch (err) {
    console.error(`[${FN}] cache write failed`, errorText(err));
  }
}

/** Calls the LLM within the global budget. Undefined means rules-only. */
async function callLlm(deps: ExtractClaimsDeps, redacted: string): Promise<unknown | undefined> {
  // The global cap protects LLM spend, so it only applies to cache misses.
  if (!(await deps.store.consumeRateLimit('extract:global', GLOBAL_LLM_LIMIT_PER_DAY, DAY_SECONDS))) return undefined;
  try {
    return await deps.llm.extract(redacted);
  } catch (err) {
    if (!(err instanceof LlmUnavailableError)) throw err;
    console.error(`[${FN}] LLM unavailable`, err.message);
    await countEvent(deps.store, 'extract_llm_failed', FN);
    return undefined;
  }
}

async function extract(deps: ExtractClaimsDeps, redacted: string, now: Date): Promise<ExtractClaimsResult> {
  const injectionInText = detectInjection(redacted);
  const key: CacheKey = { textHash: await sha256Hex(normaliseForMatch(redacted)), schemaVersion: SCHEMA_VERSION, modelId: deps.llm.modelId };
  const result = (llm: LlmExtractionV1 | null, source: ExtractionSource): ExtractClaimsResult => ({
    llm,
    source,
    injectionSuspected: injectionInText || (llm?.instructionsAddressedToAI ?? false),
  });

  const cached = await readCache(deps.store, key);
  if (cached) {
    await countEvent(deps.store, 'extract_cache_hit', FN);
    // Re-validated on read too: a cache row is only as trustworthy as the code that wrote it.
    return result(sanitiseExtraction(cached, redacted, now), 'cache');
  }

  const raw = await callLlm(deps, redacted);
  if (raw === undefined) return result(null, 'unavailable');
  const llm = sanitiseExtraction(raw, redacted, now);
  await writeCache(deps.store, key, llm);
  return result(llm, 'llm');
}

export function createExtractClaimsHandler(deps: ExtractClaimsDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());

  return withErrors(FN, async (req) => {
    const early = preflight(req);
    if (early) return early;

    const userId = await deps.auth.userId(req);
    const redactedText = parseRedactedText(await readJsonObject(req, MAX_BODY_BYTES));

    if (!(await deps.store.consumeRateLimit(await deviceBucket('extract', userId), DEVICE_LIMIT_PER_DAY, DAY_SECONDS))) {
      return fail('rate_limited', 'Daily limit reached. Claims from the on-device rules are still available.');
    }
    await countEvent(deps.store, 'extract_requested', FN);

    const redacted = redactAd(cleanAdText(redactedText)).redacted;
    return ok(await extract(deps, redacted, now()));
  });
}
