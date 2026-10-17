/** Response envelope, CORS and body parsing shared by every edge function. */

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'rate_limited'
  | 'internal';

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  method_not_allowed: 405,
  payload_too_large: 413,
  rate_limited: 429,
  internal: 500,
};

// Bearer-token API with no cookies, so a wildcard origin does not expose credentials (the Expo web demo needs CORS).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-partner-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function ok<T>(data: T): Response {
  const body: ApiResponse<T> = { ok: true, data };
  return Response.json(body, { status: 200, headers: CORS_HEADERS });
}

export function fail(code: ErrorCode, message: string): Response {
  const body: ApiResponse<never> = { ok: false, error: { code, message } };
  return Response.json(body, { status: STATUS[code], headers: CORS_HEADERS });
}

/** Answers CORS preflight and rejects anything that is not a POST. Returns undefined when the request may proceed. */
export function preflight(req: Request): Response | undefined {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return fail('method_not_allowed', 'Use POST.');
  return undefined;
}

export class HttpError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}

const tooLarge = () => new HttpError('payload_too_large', 'Request body is too large.');

/** Reads the body as a stream and stops as soon as it passes maxBytes, with or without a content-length header. */
async function readCapped(req: Request, maxBytes: number): Promise<Uint8Array> {
  if (Number(req.headers.get('content-length') ?? '0') > maxBytes) throw tooLarge();
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Reads a JSON object body, refusing anything larger than maxBytes before parsing it. */
export async function readJsonObject(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const bytes = await readCapped(req, maxBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError('bad_request', 'Body must be valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError('bad_request', 'Body must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

/** Wraps a handler so thrown HttpErrors become envelopes and anything else becomes a logged 500 without internals. */
export function withErrors(name: string, handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.code, err.message);
      console.error(`[${name}] unhandled error`, err instanceof Error ? err.message : String(err));
      return fail('internal', 'Something went wrong. Please try again.');
    }
  };
}
