/**
 * POST /registry-check (§7). Proxies a plate lookup to the country registry adapter, which is where
 * partner credentials will live. The result goes straight back to the device: nothing is stored here,
 * and the plate is never logged.
 */
import { type Authenticator, deviceBucket } from '../_shared/auth.ts';
import { MOCK_REGISTRY, type RegistryCheck } from '../_shared/core/index.ts';
import { fail, HttpError, ok, preflight, readJsonObject, withErrors } from '../_shared/http.ts';
import { type BackendStore, countEvent } from '../_shared/store.ts';

export const DEVICE_LIMIT_PER_DAY = 30;
// Anonymous sign-up is cheap, so per-device limits alone do not bound total lookups (paid scopes later).
export const GLOBAL_LIMIT_PER_DAY = 5000;
const DAY_SECONDS = 24 * 3600;
const MAX_BODY_BYTES = 1024;
const FI_PLATE = /^[A-ZÅÄÖ]{2,3}-\d{1,3}$/;

export interface VehicleRegistryAdapter {
  readonly id: string;
  readonly isMock: boolean;
  /** Undefined when the registry has no vehicle with this plate. */
  lookup(plate: string, now: Date): Promise<RegistryCheck | undefined>;
}

/** traficom-mock: the demo plates from core fixtures, served from the server like the real adapter will be. */
export const traficomMock: VehicleRegistryAdapter = {
  id: 'traficom-mock',
  isMock: true,
  lookup(plate, now) {
    const record = MOCK_REGISTRY[plate];
    return Promise.resolve(record ? { ...record, fetchedAt: now.toISOString() } : undefined);
  },
};

/** Same normalisation as the app: "abc123" and "ABC 123" both become "ABC-123". */
export function normalisePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, '').replace(/^([A-ZÅÄÖ]{2,3})(\d{1,3})$/, '$1-$2');
}

export interface RegistryCheckDeps {
  auth: Authenticator;
  store: BackendStore;
  registry: VehicleRegistryAdapter;
  now?: () => Date;
}

export type RegistryCheckResult = { found: true; registry: RegistryCheck } | { found: false };

export function createRegistryCheckHandler(deps: RegistryCheckDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());

  return withErrors('registry-check', async (req) => {
    const early = preflight(req);
    if (early) return early;

    const userId = await deps.auth.userId(req);
    const body = await readJsonObject(req, MAX_BODY_BYTES);
    if (typeof body.plate !== 'string') throw new HttpError('bad_request', 'plate is required.');
    const plate = normalisePlate(body.plate);
    if (!FI_PLATE.test(plate)) throw new HttpError('bad_request', 'plate must look like ABC-123.');

    if (!(await deps.store.consumeRateLimit(await deviceBucket('registry', userId), DEVICE_LIMIT_PER_DAY, DAY_SECONDS))) {
      return fail('rate_limited', 'Daily registry lookup limit reached.');
    }
    if (!(await deps.store.consumeRateLimit('registry:global', GLOBAL_LIMIT_PER_DAY, DAY_SECONDS))) {
      return fail('rate_limited', 'The registry check is busy today. Please try again tomorrow.');
    }

    const registry = await deps.registry.lookup(plate, now());
    await countEvent(deps.store, 'registry_checked', 'registry-check');
    return ok<RegistryCheckResult>(registry ? { found: true, registry } : { found: false });
  });
}
