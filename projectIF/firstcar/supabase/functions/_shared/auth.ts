/**
 * Caller identity. The app signs in anonymously (no account, no email or phone); each install gets a Supabase
 * user id. Rate-limit buckets store sha256(user id). That keeps raw ids out of the table, but it is unsalted,
 * so someone with database access could still link a bucket to an auth.users row. Rows live 24 h.
 */
import { sha256Hex } from './crypto.ts';
import type { SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';

export interface Authenticator {
  /** Returns the verified user id for the request's bearer token, or throws HttpError('unauthorized'). */
  userId(req: Request): Promise<string>;
}

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1];
}

/** Verifies the JWT with Supabase Auth (signature, expiry, revoked sessions), not just the gateway check. */
export function supabaseAuthenticator(client: SupabaseClient): Authenticator {
  return {
    async userId(req) {
      const token = bearerToken(req);
      if (!token) throw new HttpError('unauthorized', 'Sign-in required.');
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) throw new HttpError('unauthorized', 'Sign-in required.');
      return data.user.id;
    },
  };
}

/** Rate-limit bucket for one caller: scope + sha256(user id). */
export async function deviceBucket(scope: string, userId: string): Promise<string> {
  return `${scope}:device:${await sha256Hex(userId)}`;
}
