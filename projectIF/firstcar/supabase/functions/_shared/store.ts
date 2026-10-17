/**
 * Data access for the four backend tables (supabase/migrations). Handlers depend on the BackendStore
 * interface; the Supabase implementation uses the service-role client, the only role with grants.
 */
import { createClient, type SupabaseClient } from './deps.ts';

export type FunnelEvent =
  | 'extract_requested'
  | 'extract_cache_hit'
  | 'extract_llm_failed'
  | 'registry_checked'
  | 'handoff_created'
  | 'handoff_redeemed';

export interface CacheKey {
  textHash: string;
  schemaVersion: number;
  modelId: string;
}

export interface BackendStore {
  /** Counts one hit; false means the bucket is over its limit for the current window. */
  consumeRateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>;
  bumpFunnel(event: FunnelEvent): Promise<void>;
  getCachedExtraction(key: CacheKey): Promise<Record<string, unknown> | undefined>;
  putCachedExtraction(key: CacheKey, result: Record<string, unknown>): Promise<void>;
  insertHandoffToken(tokenHash: string, payload: Record<string, unknown>): Promise<{ expiresAt: string }>;
  /** Spends the token. Undefined when it is unknown, expired or already used. */
  redeemHandoffToken(tokenHash: string): Promise<Record<string, unknown> | undefined>;
}

export class StoreError extends Error {}

/** Funnel counters are analytics: a failure there is logged and never fails the user's request. */
export async function countEvent(store: BackendStore, event: FunnelEvent, fn: string): Promise<void> {
  try {
    await store.bumpFunnel(event);
  } catch (err) {
    console.error(`[${fn}] funnel counter failed`, err instanceof Error ? err.message : String(err));
  }
}

function check<T>(op: string, res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new StoreError(`${op} failed: ${res.error.message}`);
  return res.data;
}

export function supabaseStore(client: SupabaseClient): BackendStore {
  return {
    async consumeRateLimit(bucket, limit, windowSeconds) {
      const res = await client.rpc('consume_rate_limit', { p_bucket: bucket, p_limit: limit, p_window: `${windowSeconds} seconds` });
      return check('consume_rate_limit', res) === true;
    },

    async bumpFunnel(event) {
      check('bump_funnel', await client.rpc('bump_funnel', { p_event: event }));
    },

    async getCachedExtraction(key) {
      const res = await client
        .from('extraction_cache')
        .select('result')
        .eq('text_hash', key.textHash)
        .eq('schema_version', key.schemaVersion)
        .eq('model_id', key.modelId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      const row = check('extraction_cache select', res) as { result: Record<string, unknown> } | null;
      return row?.result ?? undefined;
    },

    async putCachedExtraction(key, result) {
      const res = await client.from('extraction_cache').upsert({
        text_hash: key.textHash,
        schema_version: key.schemaVersion,
        model_id: key.modelId,
        result,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      });
      check('extraction_cache upsert', res);
    },

    async insertHandoffToken(tokenHash, payload) {
      const res = await client.from('handoff_tokens').insert({ token_hash: tokenHash, payload }).select('expires_at').single();
      const row = check('handoff_tokens insert', res) as { expires_at: string };
      return { expiresAt: row.expires_at };
    },

    async redeemHandoffToken(tokenHash) {
      const res = await client.rpc('redeem_handoff_token', { p_token_hash: tokenHash });
      const payload = check('redeem_handoff_token', res) as Record<string, unknown> | null;
      return payload ?? undefined;
    },
  };
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

/** Service-role client for server-side use only. Never shipped to the app. */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
