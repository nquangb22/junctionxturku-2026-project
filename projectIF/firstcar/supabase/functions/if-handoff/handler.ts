/**
 * If hand-off (§1.1 A → E, §8).
 * - POST /if-handoff (app, after the consent screen): stores the minimal payload under a one-time token.
 * - POST /if-handoff-redeem (If, with the partner secret): returns that payload once.
 *
 * The payload validator is a strict allowlist. Any extra key (income, savings, ledger, seller data, ...)
 * rejects the whole request, so the "never sent" guarantee holds even if the app sends too much.
 */
import { type Authenticator, deviceBucket } from '../_shared/auth.ts';
import type { InsuranceHandoff } from '../_shared/core/index.ts';
import { randomToken, sha256Hex, timingSafeEqual } from '../_shared/crypto.ts';
import { fail, HttpError, ok, preflight, readJsonObject, withErrors } from '../_shared/http.ts';
import { type BackendStore, countEvent } from '../_shared/store.ts';

export type HandoffPayload = InsuranceHandoff['payload'];

export const DEVICE_LIMIT_PER_DAY = 10;
const DAY_SECONDS = 24 * 3600;
const MAX_BODY_BYTES = 4 * 1024;
const MAX_NAME = 60;
const MAX_DEDUCTIBLE_MINOR = 1_000_000; // €10,000
const MIN_MODEL_YEAR = 1950;
const FI_PLATE = /^[A-ZÅÄÖ]{2,3}-\d{1,3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const AGE_BANDS = new Set(['18-19', '20-25', '26-34', '35+']);
const COVER_INTENTS = new Set(['liability_only', 'liability_plus_partial', 'liability_plus_comprehensive']);

const PAYLOAD_KEYS = [
  'plate', 'make', 'model', 'modelYear', 'purchaseDate', 'buyerAgeBand',
  'firstTimeDriver', 'coverIntent', 'deductible', 'registrationRequested',
] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bad = (message: string) => new HttpError('bad_request', message);

function name(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > MAX_NAME) throw bad(`${field} must be 1-${MAX_NAME} characters.`);
  return v.trim();
}

function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Validates the consented payload against the allowlist. Throws HttpError('bad_request') on anything else. */
export function parseHandoffPayload(raw: unknown, now: Date): HandoffPayload {
  if (!isObject(raw)) throw bad('payload must be an object.');
  const extra = Object.keys(raw).filter((k) => !(PAYLOAD_KEYS as readonly string[]).includes(k));
  if (extra.length > 0) throw bad(`payload has fields that may not be sent to the insurer: ${extra.join(', ')}.`);

  const { plate, modelYear, purchaseDate, buyerAgeBand, firstTimeDriver, coverIntent, deductible, registrationRequested } = raw;
  if (typeof plate !== 'string' || !FI_PLATE.test(plate)) throw bad('plate must look like ABC-123.');
  if (typeof modelYear !== 'number' || !Number.isInteger(modelYear) || modelYear < MIN_MODEL_YEAR || modelYear > now.getUTCFullYear() + 1) {
    throw bad('modelYear is out of range.');
  }
  if (typeof purchaseDate !== 'string' || !ISO_DATE.test(purchaseDate) || !isRealDate(purchaseDate)) throw bad('purchaseDate must be YYYY-MM-DD.');
  if (typeof buyerAgeBand !== 'string' || !AGE_BANDS.has(buyerAgeBand)) throw bad('buyerAgeBand is invalid.');
  if (typeof coverIntent !== 'string' || !COVER_INTENTS.has(coverIntent)) throw bad('coverIntent is invalid.');
  if (typeof firstTimeDriver !== 'boolean' || typeof registrationRequested !== 'boolean') throw bad('firstTimeDriver and registrationRequested must be booleans.');
  if (
    !isObject(deductible) || Object.keys(deductible).some((k) => k !== 'minor' && k !== 'currency') ||
    deductible.currency !== 'EUR' || typeof deductible.minor !== 'number' || !Number.isInteger(deductible.minor) ||
    deductible.minor < 0 || deductible.minor > MAX_DEDUCTIBLE_MINOR
  ) {
    throw bad('deductible must be { minor, currency: "EUR" }.');
  }

  return {
    plate,
    make: name(raw.make, 'make'),
    model: name(raw.model, 'model'),
    modelYear,
    purchaseDate,
    buyerAgeBand: buyerAgeBand as HandoffPayload['buyerAgeBand'],
    firstTimeDriver,
    coverIntent: coverIntent as HandoffPayload['coverIntent'],
    deductible: { minor: deductible.minor, currency: 'EUR' },
    registrationRequested,
  };
}

export interface CreateHandoffDeps {
  auth: Authenticator;
  store: BackendStore;
  now?: () => Date;
}

export function createHandoffHandler(deps: CreateHandoffDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());

  return withErrors('if-handoff', async (req) => {
    const early = preflight(req);
    if (early) return early;

    const userId = await deps.auth.userId(req);
    const body = await readJsonObject(req, MAX_BODY_BYTES);
    if (body.consent !== true) throw bad('consent must be true: the user has to confirm the payload first.');
    const payload = parseHandoffPayload(body.payload, now());

    if (!(await deps.store.consumeRateLimit(await deviceBucket('handoff', userId), DEVICE_LIMIT_PER_DAY, DAY_SECONDS))) {
      return fail('rate_limited', 'Too many hand-offs today.');
    }

    // Only the hash is stored, so a database leak does not hand out redeemable tokens.
    const token = randomToken();
    const { expiresAt } = await deps.store.insertHandoffToken(await sha256Hex(token), payload as unknown as Record<string, unknown>);
    await countEvent(deps.store, 'handoff_created', 'if-handoff');
    return ok({ token, expiresAt });
  });
}

export interface RedeemHandoffDeps {
  store: BackendStore;
  partnerSecret: string;
}

export function redeemHandoffHandler(deps: RedeemHandoffDeps): (req: Request) => Promise<Response> {
  return withErrors('if-handoff-redeem', async (req) => {
    const early = preflight(req);
    if (early) return early;

    const secret = req.headers.get('x-partner-secret') ?? '';
    if (!timingSafeEqual(secret, deps.partnerSecret)) return fail('unauthorized', 'Partner authentication failed.');

    const body = await readJsonObject(req, MAX_BODY_BYTES);
    if (typeof body.token !== 'string' || !TOKEN.test(body.token)) throw bad('token is invalid.');

    const payload = await deps.store.redeemHandoffToken(await sha256Hex(body.token));
    if (!payload) return fail('not_found', 'Token is unknown, expired or already used.');
    await countEvent(deps.store, 'handoff_redeemed', 'if-handoff-redeem');
    return ok({ payload });
  });
}
