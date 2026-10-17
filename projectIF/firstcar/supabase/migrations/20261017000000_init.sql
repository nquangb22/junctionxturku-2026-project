-- FirstCar backend schema (docs/architecture.md §1.1, §5, §8).
-- The server is stateless apart from these four tables. None hold buyer data; seller data is minimised:
--   extraction_cache  LLM claim extraction results keyed by a hash of the redacted ad (30 d)
--   rate_limits       request counters per hashed anonymous device id and globally (24 h)
--   funnel_counters   daily event counts with no ids; If sees only counts >= 10
--   handoff_tokens    one-time If hand-off tokens, stored as hashes (24 h)
-- They hold no buyer data. Seller data is minimised, not guaranteed absent: quotes come from redacted ad text,
-- and redaction is heuristic. Only the edge functions (service_role) touch these tables. RLS is on with no policies,
-- and anon/authenticated have no grants, so the public API cannot read or write anything.

-- ---------- extraction_cache ----------

create table public.extraction_cache (
  text_hash      text        not null check (text_hash ~ '^[0-9a-f]{64}$'),
  schema_version smallint    not null check (schema_version > 0),
  model_id       text        not null check (length(model_id) between 1 and 100),
  result         jsonb       not null check (jsonb_typeof(result) = 'object'),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '30 days',
  primary key (text_hash, schema_version, model_id)
);

create index extraction_cache_expires_at_idx on public.extraction_cache (expires_at);

comment on table public.extraction_cache is
  'Minimised: ExtractionV1 has no seller name/phone/plate fields and quotes come from redacted text. Redaction is heuristic, so free-text quotes may still contain personal data; rows expire after 30 d.';

-- ---------- rate_limits ----------

create table public.rate_limits (
  bucket       text        not null check (length(bucket) between 1 and 200),
  window_start timestamptz not null,
  hits         integer     not null default 0 check (hits >= 0),
  primary key (bucket, window_start)
);

create index rate_limits_window_start_idx on public.rate_limits (window_start);

comment on column public.rate_limits.bucket is
  'Scope + hashed anonymous user id (e.g. extract:device:<sha256>) or a global scope (extract:global). Never a raw id.';

-- Atomically counts one hit in the current window and reports whether it is still within the limit.
create function public.consume_rate_limit(p_bucket text, p_limit integer, p_window interval)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_window_start timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00');
  v_hits integer;
begin
  -- Windows over 24 h would be cut short by purge_expired(), which keeps 24 h of rate-limit rows.
  if p_limit is null or p_window is null or p_limit < 1 or p_window <= interval '0' or p_window > interval '24 hours' then
    raise exception 'invalid rate limit arguments';
  end if;

  insert into public.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

-- ---------- funnel_counters ----------

create table public.funnel_counters (
  event text   not null check (event in (
    'extract_requested', 'extract_cache_hit', 'extract_llm_failed',
    'registry_checked', 'handoff_created', 'handoff_redeemed'
  )),
  day   date   not null,
  count bigint not null default 0 check (count >= 0),
  primary key (event, day)
);

create function public.bump_funnel(p_event text)
returns void
language sql
set search_path = ''
as $$
  insert into public.funnel_counters as f (event, day, count)
  values (p_event, (now() at time zone 'utc')::date, 1)
  on conflict (event, day) do update set count = f.count + 1;
$$;

-- What If is allowed to see: aggregates with k >= 10 only (§8, §9).
-- Read only by the edge functions (service_role). An insurer-facing role must not get this view, since
-- security_invoker would also need select on funnel_counters; expose a SECURITY DEFINER function instead.
create view public.funnel_kpis
with (security_invoker = true)
as
  select event, day, count
  from public.funnel_counters
  where count >= 10;

-- ---------- handoff_tokens ----------

create table public.handoff_tokens (
  token_hash  text        primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  payload     jsonb       not null check (jsonb_typeof(payload) = 'object'),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);

create index handoff_tokens_expires_at_idx on public.handoff_tokens (expires_at);

comment on column public.handoff_tokens.payload is
  'The consented minimal payload only (plate, vehicle, age band, cover intent). The plate is personal data, so rows are deleted on redemption and after 24 h. Never income, savings, ledger or seller data.';

-- One-time redemption: returns the payload once and deletes the row, so nothing stays after If has it.
-- A concurrent second call waits on the row lock, re-checks and gets null. Expired or reused tokens return null.
create function public.redeem_handoff_token(p_token_hash text)
returns jsonb
language sql
set search_path = ''
as $$
  delete from public.handoff_tokens
  where token_hash = p_token_hash
    and expires_at > now()
  returning payload;
$$;

-- ---------- retention ----------

create function public.purge_expired()
returns void
language sql
set search_path = ''
as $$
  delete from public.extraction_cache where expires_at <= now();
  delete from public.rate_limits where window_start < now() - interval '24 hours';
  delete from public.handoff_tokens where expires_at <= now();
$$;

-- Hourly purge via pg_cron (Supabase ships it). Skipped only where the extension does not exist at all,
-- e.g. plain local Postgres; any other failure aborts the migration so retention cannot silently stop.
-- cron.schedule upserts by job name, so re-running is safe. Verify after deploy:
--   select jobname, schedule from cron.job where jobname like 'firstcar-%';
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('firstcar-purge-expired', '17 * * * *', 'select public.purge_expired()');
    perform cron.schedule('firstcar-purge-cron-history', '47 3 * * *',
      $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$);
  else
    raise warning 'pg_cron is not available: purge_expired() is NOT scheduled';
  end if;
end;
$$;

-- ---------- lock down ----------

alter table public.extraction_cache enable row level security;
alter table public.rate_limits      enable row level security;
alter table public.funnel_counters  enable row level security;
alter table public.handoff_tokens   enable row level security;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.extraction_cache, public.rate_limits, public.funnel_counters, public.handoff_tokens, public.funnel_kpis from %I', r);
      -- Supabase's default privileges grant new functions to anon/authenticated directly, not only via PUBLIC.
      execute format('revoke execute on function public.consume_rate_limit(text, integer, interval), public.bump_funnel(text), public.redeem_handoff_token(text), public.purge_expired() from %I', r);
    end if;
  end loop;
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer, interval) from public;
revoke execute on function public.bump_funnel(text)                          from public;
revoke execute on function public.redeem_handoff_token(text)                 from public;
revoke execute on function public.purge_expired()                            from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    -- The SQL functions run as the caller, so the edge functions' role needs the table grants itself
    -- (explicit here rather than relying on Supabase's default privileges).
    grant select, insert, update, delete on public.extraction_cache, public.rate_limits, public.funnel_counters, public.handoff_tokens to service_role;
    grant select on public.funnel_kpis to service_role;
    grant execute on function public.consume_rate_limit(text, integer, interval) to service_role;
    grant execute on function public.bump_funnel(text)                          to service_role;
    grant execute on function public.redeem_handoff_token(text)                 to service_role;
    grant execute on function public.purge_expired()                            to service_role;
  end if;
end;
$$;
