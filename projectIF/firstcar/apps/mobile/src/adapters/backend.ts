/**
 * Thin client for the Supabase edge functions (supabase/functions). Off unless both
 * EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set, so the mock-first build keeps working.
 *
 * Auth is an anonymous Supabase session: no email, phone or password. The session lives in SecureStore
 * (this device only) and is refreshed shortly before it expires.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
// The anon key is public by design: it only identifies the project, and RLS + function auth do the protecting.
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SESSION_KEY = 'fc.backendSession';
const REFRESH_MARGIN_S = 60;
const REQUEST_TIMEOUT_MS = 20_000;
const secureOpts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const isBackendConfigured = () => SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

export class BackendError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number) {
    super(message);
  }
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
}

let cached: Session | undefined;

async function loadSession(): Promise<Session | undefined> {
  if (cached) return cached;
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(SESSION_KEY) : await SecureStore.getItemAsync(SESSION_KEY, secureOpts);
    cached = raw ? (JSON.parse(raw) as Session) : undefined;
  } catch {
    cached = undefined; // unreadable session: sign in again
  }
  return cached;
}

async function saveSession(session: Session): Promise<void> {
  cached = session;
  const raw = JSON.stringify(session);
  try {
    // Web is the demo build only: there the refresh token sits in localStorage.
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(SESSION_KEY, raw);
    else await SecureStore.setItemAsync(SESSION_KEY, raw, secureOpts);
  } catch {
    // Not persisted: the in-memory session still works until the app restarts.
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new BackendError('network', 'Could not reach the server.');
  } finally {
    clearTimeout(timer);
  }
}

async function authRequest(path: string, body: Record<string, unknown>): Promise<Session> {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new BackendError('auth', `Sign-in failed (${res.status}).`, res.status);
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number };
  if (!json.access_token || !json.refresh_token) throw new BackendError('auth', 'Sign-in returned no session.');
  const expiresAt = json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 0);
  const session = { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt };
  await saveSession(session);
  return session;
}

const isRejected = (err: unknown) => err instanceof BackendError && (err.status === 400 || err.status === 401);

async function renewSession(): Promise<Session> {
  const session = await loadSession();
  if (session) {
    try {
      return await authRequest('token?grant_type=refresh_token', { refresh_token: session.refreshToken });
    } catch (err) {
      // Only a rejected refresh token means "start over". On 5xx/429/network, fail instead of minting new users.
      if (!isRejected(err)) throw err;
    }
  }
  return authRequest('signup', {});
}

let renewing: Promise<Session> | undefined;

/** A valid access token: reuses, refreshes or creates the anonymous session. Concurrent callers share one renewal. */
async function accessToken(): Promise<string> {
  const session = await loadSession();
  if (session && session.expiresAt - REFRESH_MARGIN_S > Math.floor(Date.now() / 1000)) return session.accessToken;
  renewing ??= renewSession().finally(() => {
    renewing = undefined;
  });
  return (await renewing).accessToken;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

// Gateway errors (expired JWT, function boot failure) are not in our envelope, so check the shape.
const isEnvelope = (v: unknown): v is Envelope<unknown> =>
  typeof v === 'object' && v !== null && typeof (v as { ok?: unknown }).ok === 'boolean' &&
  ((v as { ok: boolean }).ok || typeof (v as { error?: { code?: unknown } }).error?.code === 'string');

/** Calls an edge function and unwraps the { ok, data | error } envelope. */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!isBackendConfigured()) throw new BackendError('not_configured', 'Backend is not configured.');
  const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  if (!isEnvelope(json)) throw new BackendError(`http_${res.status}`, `Server returned ${res.status}.`, res.status);
  if (!json.ok) throw new BackendError(json.error.code, json.error.message, res.status);
  return json.data as T;
}
