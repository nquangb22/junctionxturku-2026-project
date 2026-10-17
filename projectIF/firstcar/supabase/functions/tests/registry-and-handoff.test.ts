import { assert, assertEquals, assertFalse, assertMatch } from 'jsr:@std/assert@1.0.19';
import { sha256Hex } from '../_shared/crypto.ts';
import { createHandoffHandler, parseHandoffPayload, redeemHandoffHandler } from '../if-handoff/handler.ts';
import { createRegistryCheckHandler, DEVICE_LIMIT_PER_DAY, normalisePlate, traficomMock } from '../registry-check/handler.ts';
import { fakeAuth, memoryStore, post, readJson } from './fakes.ts';

const NOW = () => new Date('2026-10-17T12:00:00Z');
const SECRET = 'p'.repeat(40);

/* ---------- registry-check ---------- */

Deno.test('registry-check returns the mock record for a known plate in any spelling', async () => {
  const store = memoryStore();
  const handler = createRegistryCheckHandler({ auth: fakeAuth, store, registry: traficomMock, now: NOW });

  const json = await readJson(await handler(post('registry-check', { plate: 'abc 123' })));

  assertEquals(json.data.found, true);
  assertEquals(json.data.registry.plate, 'ABC-123');
  assertEquals(json.data.registry.fetchedAt, '2026-10-17T12:00:00.000Z');
  assertEquals(store.funnel, ['registry_checked']);
});

Deno.test('registry-check reports unknown plates without an error', async () => {
  const handler = createRegistryCheckHandler({ auth: fakeAuth, store: memoryStore(), registry: traficomMock, now: NOW });

  const json = await readJson(await handler(post('registry-check', { plate: 'ZZZ-999' })));

  assertEquals(json.data, { found: false });
});

Deno.test('registry-check validates input, auth and the daily limit', async () => {
  const store = memoryStore();
  const handler = createRegistryCheckHandler({ auth: fakeAuth, store, registry: traficomMock, now: NOW });

  assertEquals((await handler(post('registry-check', { plate: 'ABC-123' }, {}))).status, 401);
  assertEquals((await handler(post('registry-check', {}))).status, 400);
  assertEquals((await handler(post('registry-check', { plate: '<script>' }))).status, 400);
  for (let i = 0; i < DEVICE_LIMIT_PER_DAY; i++) await handler(post('registry-check', { plate: 'ABC-123' }));
  assertEquals((await handler(post('registry-check', { plate: 'ABC-123' }))).status, 429);
});

Deno.test('a failing funnel counter does not fail a registry lookup', async () => {
  const store = memoryStore();
  store.failFunnel = true;
  const handler = createRegistryCheckHandler({ auth: fakeAuth, store, registry: traficomMock, now: NOW });

  assertEquals((await handler(post('registry-check', { plate: 'ABC-123' }))).status, 200);
});

Deno.test('normalisePlate matches the app', () => {
  assertEquals(normalisePlate(' xyz789 '), 'XYZ-789');
  assertEquals(normalisePlate('ab-12'), 'AB-12');
});

/* ---------- if-handoff ---------- */

const payload = {
  plate: 'ABC-123',
  make: 'Volkswagen',
  model: 'Golf',
  modelYear: 2012,
  purchaseDate: '2026-10-17',
  buyerAgeBand: '20-25',
  firstTimeDriver: true,
  coverIntent: 'liability_plus_partial',
  deductible: { minor: 30000, currency: 'EUR' },
  registrationRequested: true,
};

Deno.test('creates a one-time token and stores only its hash', async () => {
  const store = memoryStore();
  const handler = createHandoffHandler({ auth: fakeAuth, store, now: NOW });

  const json = await readJson(await handler(post('if-handoff', { consent: true, payload })));

  assertMatch(json.data.token, /^[A-Za-z0-9_-]{43}$/);
  assertFalse(store.tokens.has(json.data.token));
  assert(store.tokens.has(await sha256Hex(json.data.token)));
  assertEquals(store.funnel, ['handoff_created']);
});

Deno.test('refuses a hand-off without consent or with fields the insurer must never get', async () => {
  const store = memoryStore();
  const handler = createHandoffHandler({ auth: fakeAuth, store, now: NOW });

  assertEquals((await handler(post('if-handoff', { payload }))).status, 400);
  const res = await handler(post('if-handoff', { consent: true, payload: { ...payload, netMonthlyIncome: 2500 } }));
  assertEquals(res.status, 400);
  assertMatch((await readJson(res)).error!.message, /netMonthlyIncome/);
  assertEquals(store.tokens.size, 0);
});

Deno.test('parseHandoffPayload rejects each malformed field', () => {
  const now = new Date('2026-10-17T00:00:00Z');
  const cases: Record<string, unknown>[] = [
    { plate: 'nope' },
    { make: '' },
    { model: 'x'.repeat(61) },
    { modelYear: 1900 },
    { modelYear: 2030 },
    { purchaseDate: '2026-02-30' },
    { purchaseDate: '17.10.2026' },
    { buyerAgeBand: '12-17' },
    { coverIntent: 'everything' },
    { firstTimeDriver: 'yes' },
    { deductible: { minor: 30000, currency: 'USD' } },
    { deductible: { minor: -1, currency: 'EUR' } },
    { deductible: { minor: 1, currency: 'EUR', note: 'x' } },
  ];
  for (const patch of cases) {
    let threw = false;
    try {
      parseHandoffPayload({ ...payload, ...patch }, now);
    } catch {
      threw = true;
    }
    assert(threw, `expected rejection for ${JSON.stringify(patch)}`);
  }
  assertEquals(parseHandoffPayload({ ...payload, make: '  Volkswagen ' }, now).make, 'Volkswagen');
});

Deno.test('hand-off creation is rate limited per device', async () => {
  const handler = createHandoffHandler({ auth: fakeAuth, store: memoryStore({ handoff: 1 }), now: NOW });

  assertEquals((await handler(post('if-handoff', { consent: true, payload }))).status, 200);
  assertEquals((await handler(post('if-handoff', { consent: true, payload }))).status, 429);
});

Deno.test('If redeems a token exactly once with the partner secret', async () => {
  const store = memoryStore();
  const create = createHandoffHandler({ auth: fakeAuth, store, now: NOW });
  const redeem = redeemHandoffHandler({ store, partnerSecret: SECRET });
  const { data } = await readJson(await create(post('if-handoff', { consent: true, payload })));

  const first = await readJson(await redeem(post('if-handoff-redeem', { token: data.token }, { 'x-partner-secret': SECRET })));
  const second = await redeem(post('if-handoff-redeem', { token: data.token }, { 'x-partner-secret': SECRET }));

  assertEquals(first.data.payload, payload);
  assertEquals(second.status, 404);
  assertEquals(store.funnel, ['handoff_created', 'handoff_redeemed']);
});

Deno.test('redeem rejects a wrong secret and malformed tokens', async () => {
  const redeem = redeemHandoffHandler({ store: memoryStore(), partnerSecret: SECRET });

  assertEquals((await redeem(post('if-handoff-redeem', { token: 'a'.repeat(43) }, { 'x-partner-secret': 'wrong' }))).status, 401);
  assertEquals((await redeem(post('if-handoff-redeem', { token: 'a'.repeat(43) }, {}))).status, 401);
  assertEquals((await redeem(post('if-handoff-redeem', { token: 'short' }, { 'x-partner-secret': SECRET }))).status, 400);
});

Deno.test('registry-check has a global daily cap on top of the per-device one', async () => {
  const handler = createRegistryCheckHandler({ auth: fakeAuth, store: memoryStore({ 'registry:global': 0 }), registry: traficomMock, now: NOW });

  assertEquals((await handler(post('registry-check', { plate: 'ABC-123' }))).status, 429);
});
