/**
 * Runs the real migration in PGlite (Postgres compiled to WASM) and checks the SQL functions,
 * retention, the k >= 10 view and that the public API roles cannot touch anything.
 */
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.19';
import { PGlite } from 'npm:@electric-sql/pglite@0.5.10';

const MIGRATION = new URL('../../migrations/20261017000000_init.sql', import.meta.url);
const HASH = 'a'.repeat(64);

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  // The roles and default privileges hosted Supabase sets up, so the migration's revokes are really exercised.
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  await db.exec(await Deno.readTextFile(MIGRATION));
  return db;
}

const one = async <T>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

Deno.test('consume_rate_limit allows up to the limit, then refuses', async () => {
  const db = await freshDb();
  const results: boolean[] = [];
  for (let i = 0; i < 4; i++) {
    results.push((await one<{ ok: boolean }>(db, `select public.consume_rate_limit('b', 3, interval '1 day') as ok`)).ok);
  }
  assertEquals(results, [true, true, true, false]);
  assertEquals((await one<{ hits: number }>(db, `select hits from public.rate_limits where bucket = 'b'`)).hits, 4);
  await assertRejects(() => db.query(`select public.consume_rate_limit('b', 0, interval '1 day')`));
  await assertRejects(() => db.query(`select public.consume_rate_limit('b', null, interval '1 day')`));
  await assertRejects(() => db.query(`select public.consume_rate_limit('b', 3, interval '2 days')`));
  await db.close();
});

Deno.test('bump_funnel counts per day and funnel_kpis hides counts under 10', async () => {
  const db = await freshDb();
  for (let i = 0; i < 10; i++) await db.query(`select public.bump_funnel('extract_requested')`);
  await db.query(`select public.bump_funnel('registry_checked')`);

  const rows = (await db.query<{ event: string; count: number }>(`select event, count::int from public.funnel_kpis`)).rows;
  assertEquals(rows, [{ event: 'extract_requested', count: 10 }]);
  await assertRejects(() => db.query(`select public.bump_funnel('not_an_event')`));
  await db.close();
});

Deno.test('redeem_handoff_token works once, deletes the row and never works after expiry', async () => {
  const db = await freshDb();
  await db.query(`insert into public.handoff_tokens (token_hash, payload) values ($1, '{"plate":"ABC-123"}')`, [HASH]);
  await db.query(`insert into public.handoff_tokens (token_hash, payload, expires_at) values ($1, '{}', now() - interval '1 minute')`, ['b'.repeat(64)]);

  const first = await one<{ p: unknown }>(db, `select public.redeem_handoff_token($1) as p`, [HASH]);
  const second = await one<{ p: unknown }>(db, `select public.redeem_handoff_token($1) as p`, [HASH]);
  const expired = await one<{ p: unknown }>(db, `select public.redeem_handoff_token($1) as p`, ['b'.repeat(64)]);

  assertEquals(first.p, { plate: 'ABC-123' });
  assertEquals(second.p, null);
  assertEquals(expired.p, null);
  assertEquals((await one<{ n: number }>(db, `select count(*)::int as n from public.handoff_tokens where token_hash = $1`, [HASH])).n, 0);
  await db.close();
});

Deno.test('purge_expired removes expired cache rows, old rate windows and spent tokens', async () => {
  const db = await freshDb();
  await db.exec(`
    insert into public.extraction_cache (text_hash, schema_version, model_id, result, expires_at)
      values ('${HASH}', 1, 'm', '{}', now() - interval '1 second'), ('${'c'.repeat(64)}', 1, 'm', '{}', default);
    insert into public.rate_limits (bucket, window_start, hits) values ('old', now() - interval '2 days', 1), ('new', now(), 1);
    insert into public.handoff_tokens (token_hash, payload, expires_at) values
      ('${HASH}', '{}', now() - interval '1 second'), ('${'d'.repeat(64)}', '{}', default);
  `);

  await db.query(`select public.purge_expired()`);

  assertEquals((await one<{ n: number }>(db, `select count(*)::int as n from public.extraction_cache`)).n, 1);
  assertEquals((await one<{ b: string }>(db, `select string_agg(bucket, ',') as b from public.rate_limits`)).b, 'new');
  assertEquals((await one<{ h: string }>(db, `select string_agg(token_hash, ',') as h from public.handoff_tokens`)).h, 'd'.repeat(64));
  await db.close();
});

Deno.test('constraints reject malformed rows', async () => {
  const db = await freshDb();
  await assertRejects(() => db.query(`insert into public.extraction_cache (text_hash, schema_version, model_id, result) values ('nothex', 1, 'm', '{}')`));
  await assertRejects(() => db.query(`insert into public.extraction_cache (text_hash, schema_version, model_id, result) values ($1, 1, 'm', '[]')`, [HASH]));
  await assertRejects(() => db.query(`insert into public.handoff_tokens (token_hash, payload) values ('short', '{}')`));
  await db.close();
});

Deno.test('anon and authenticated cannot read tables or call the functions', async () => {
  const db = await freshDb();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const sql of [
      'select * from public.extraction_cache',
      'select * from public.rate_limits',
      'select * from public.funnel_counters',
      'select * from public.handoff_tokens',
      'select * from public.funnel_kpis',
      `insert into public.handoff_tokens (token_hash, payload) values ('${HASH}', '{}')`,
      `update public.rate_limits set hits = 0`,
      'delete from public.extraction_cache',
      `select public.consume_rate_limit('x', 1, interval '1 day')`,
      `select public.bump_funnel('extract_requested')`,
      `select public.redeem_handoff_token('${HASH}')`,
      'select public.purge_expired()',
    ]) {
      await assertRejects(() => db.query(sql), Error, 'permission denied', `${role}: ${sql}`);
    }
    await db.exec('reset role');
  }
  await db.close();
});

Deno.test('service_role can use every table and function the edge functions need', async () => {
  const db = await freshDb();
  await db.exec('set role service_role');
  assert((await one<{ ok: boolean }>(db, `select public.consume_rate_limit('x', 1, interval '1 day') as ok`)).ok);
  await db.query(`select public.bump_funnel('extract_requested')`);
  await db.query(`select * from public.funnel_kpis`);
  // Same shape as the PostgREST upsert in store.ts.
  const upsert = `insert into public.extraction_cache (text_hash, schema_version, model_id, result) values ($1, 1, 'm', $2)
    on conflict (text_hash, schema_version, model_id) do update set result = excluded.result`;
  await db.query(upsert, [HASH, '{"v":1}']);
  await db.query(upsert, [HASH, '{"v":2}']);
  assertEquals((await one<{ result: unknown }>(db, `select result from public.extraction_cache`)).result, { v: 2 });
  const inserted = await one<{ expires_at: Date }>(db, `insert into public.handoff_tokens (token_hash, payload) values ($1, '{}') returning expires_at`, [HASH]);
  assert(inserted.expires_at instanceof Date);
  assertEquals((await one<{ p: unknown }>(db, `select public.redeem_handoff_token($1) as p`, [HASH])).p, {});
  await db.query('select public.purge_expired()');
  await db.close();
});
