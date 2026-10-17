/** In-memory test doubles for the handler dependencies. */
import type { Authenticator } from '../_shared/auth.ts';
import { HttpError } from '../_shared/http.ts';
import type { BackendStore, CacheKey, FunnelEvent } from '../_shared/store.ts';
import { type LlmExtractor, LlmUnavailableError } from '../extract-claims/llm.ts';

export const VALID_TOKEN = 'test-user-token';

export const fakeAuth: Authenticator = {
  userId(req) {
    if (req.headers.get('authorization') !== `Bearer ${VALID_TOKEN}`) {
      return Promise.reject(new HttpError('unauthorized', 'Sign-in required.'));
    }
    return Promise.resolve('user-1');
  },
};

export interface MemoryStore extends BackendStore {
  hits: Map<string, number>;
  funnel: FunnelEvent[];
  cache: Map<string, Record<string, unknown>>;
  tokens: Map<string, { payload: Record<string, unknown>; used: boolean }>;
  failFunnel: boolean;
}

const cacheId = (k: CacheKey) => `${k.textHash}|${k.schemaVersion}|${k.modelId}`;

export function memoryStore(limits: Record<string, number> = {}): MemoryStore {
  const store: MemoryStore = {
    hits: new Map(),
    funnel: [],
    cache: new Map(),
    tokens: new Map(),
    failFunnel: false,
    consumeRateLimit(bucket, limit) {
      const n = (store.hits.get(bucket) ?? 0) + 1;
      store.hits.set(bucket, n);
      return Promise.resolve(n <= (limits[bucket.split(':device:')[0]] ?? limit));
    },
    bumpFunnel(event) {
      if (store.failFunnel) return Promise.reject(new Error('counter down'));
      store.funnel.push(event);
      return Promise.resolve();
    },
    getCachedExtraction(key) {
      return Promise.resolve(store.cache.get(cacheId(key)));
    },
    putCachedExtraction(key, result) {
      store.cache.set(cacheId(key), result);
      return Promise.resolve();
    },
    insertHandoffToken(hash, payload) {
      store.tokens.set(hash, { payload, used: false });
      return Promise.resolve({ expiresAt: '2026-10-18T12:00:00.000Z' });
    },
    redeemHandoffToken(hash) {
      const row = store.tokens.get(hash);
      if (!row || row.used) return Promise.resolve(undefined);
      row.used = true;
      return Promise.resolve(row.payload);
    },
  };
  return store;
}

export interface FakeLlm extends LlmExtractor {
  calls: string[];
}

export function fakeLlm(output: unknown | (() => unknown)): FakeLlm {
  const llm: FakeLlm = {
    modelId: 'fake-model',
    calls: [],
    extract(text) {
      llm.calls.push(text);
      try {
        return Promise.resolve(typeof output === 'function' ? (output as () => unknown)() : output);
      } catch (err) {
        return Promise.reject(err);
      }
    },
  };
  return llm;
}

export const unavailableLlm = () => fakeLlm(() => {
  throw new LlmUnavailableError('down');
});

export function post(path: string, body: unknown, headers: Record<string, string> = { authorization: `Bearer ${VALID_TOKEN}` }): Request {
  return new Request(`http://localhost/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// Tests assert on arbitrary response shapes; `any` keeps them readable.
// deno-lint-ignore no-explicit-any
export async function readJson(res: Response): Promise<{ ok: boolean; data?: any; error?: { code: string; message: string } }> {
  return await res.json();
}
