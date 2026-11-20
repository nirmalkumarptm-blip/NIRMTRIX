-- NIRMTRIX pairing + sync. UNEXECUTED: no Postgres in the build sandbox. Run supabase/tests/rls_isolation.sql after applying.
-- Design: every device signs in with Supabase ANONYMOUS auth (one auth user per device). devices.auth_uid links that user to an account.
-- No service-role key and no custom JWT secret exist anywhere in the app. All access is decided by RLS + the functions below.
create extension if not exists pgcrypto with schema extensions;

create table public.accounts(id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
create table public.devices(
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id) on delete cascade,
  auth_uid uuid not null unique, name text not null check (length(name) between 1 and 60),
  status text not null default 'active' check (status in ('pending','active','revoked')),
  created_at timestamptz not null default now(), revoked_at timestamptz);
create table public.pairing_codes(code_hash text primary key, account_id uuid not null references public.accounts(id) on delete cascade,
  created_by uuid not null references public.devices(id) on delete cascade, expires_at timestamptz not null, used_at timestamptz);
create table public.auth_attempts(id bigserial primary key, uid uuid not null, ok boolean not null, at timestamptz not null default now());
create index on public.auth_attempts(at);
create sequence public.sync_seq;
create table public.sync_records(
  account_id uuid not null references public.accounts(id) on delete cascade,
  tbl text not null check (tbl in ('categories','tasks','reminders')), id text not null check (length(id) between 1 and 80),
  data jsonb not null check (pg_column_size(data) < 65536), version bigint not null default 1, deleted boolean not null default false,
  seq bigint not null default nextval('public.sync_seq'), updated_at timestamptz not null default now(), device_id uuid references public.devices(id) on delete set null,
  primary key (account_id, tbl, id));
create index on public.sync_records(account_id, seq);

alter table public.accounts enable row level security;       alter table public.accounts force row level security;
alter table public.devices enable row level security;        alter table public.devices force row level security;
alter table public.pairing_codes enable row level security;  alter table public.pairing_codes force row level security;
alter table public.auth_attempts enable row level security;  alter table public.auth_attempts force row level security;
alter table public.sync_records enable row level security;   alter table public.sync_records force row level security;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- The caller's account, only while their device is ACTIVE (pending/revoked devices get null => no data).
create function public.current_account() returns uuid language sql stable security definer set search_path = public, pg_temp as
$$ select account_id from public.devices where auth_uid = auth.uid() and status = 'active' limit 1 $$;

create policy sync_read on public.sync_records for select to authenticated using (account_id = public.current_account());
create policy dev_read on public.devices for select to authenticated using (account_id = public.current_account() or auth_uid = auth.uid());
grant select on public.sync_records, public.devices to authenticated;   -- no insert/update/delete grants: writes only via functions

create function public.bootstrap_device(dev_name text) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare acc uuid; dev uuid; begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if exists (select 1 from public.devices where auth_uid = auth.uid()) then raise exception 'device already registered'; end if;
  insert into public.accounts default values returning id into acc;
  insert into public.devices(account_id, auth_uid, name) values (acc, auth.uid(), dev_name) returning id into dev; return dev; end $$;

-- Pairing code: 8 chars, ~39 bits, stored only as a SHA-256 hash, single use, 5 min, one live code per account.
create function public.pair_create() returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare acc uuid := public.current_account(); dev uuid; alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; code text := ''; b bytea := extensions.gen_random_bytes(8); i int; begin
  if acc is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select id into dev from public.devices where auth_uid = auth.uid();
  for i in 0..7 loop code := code || substr(alphabet, 1 + (get_byte(b, i) % 31), 1); end loop;
  delete from public.pairing_codes where account_id = acc and used_at is null;
  insert into public.pairing_codes values (encode(extensions.digest(code, 'sha256'), 'hex'), acc, dev, now() + interval '5 minutes');
  return code; end $$;

-- Redeem creates a PENDING device (no data access) until the first device approves it. Wrong/expired code returns null (and is logged).
create function public.pair_redeem(code text, dev_name text) returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare acc uuid; dev uuid; h text := encode(extensions.digest(upper(trim(code)), 'sha256'), 'hex'); begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if exists (select 1 from public.devices where auth_uid = auth.uid()) then raise exception 'device already registered'; end if;
  if (select count(*) from public.auth_attempts where uid = auth.uid() and not ok and at > now() - interval '10 minutes') >= 5 then raise exception 'rate_limited'; end if;
  if (select count(*) from public.auth_attempts where not ok and at > now() - interval '1 minute') >= 60 then raise exception 'try_later'; end if;
  update public.pairing_codes set used_at = now() where code_hash = h and used_at is null and expires_at > now() returning account_id into acc;
  if acc is null then insert into public.auth_attempts(uid, ok) values (auth.uid(), false); return null; end if;
  insert into public.auth_attempts(uid, ok) values (auth.uid(), true);
  insert into public.devices(account_id, auth_uid, name, status) values (acc, auth.uid(), dev_name, 'pending') returning id into dev; return dev; end $$;

create function public.pair_approve(target uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.current_account() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  update public.devices set status = 'active' where id = target and account_id = public.current_account() and status = 'pending';
  if not found then raise exception 'no pending device'; end if; end $$;

-- Revoke another device, reject a pending one, or unpair this one. Takes effect immediately (current_account() requires status='active').
create function public.revoke_device(target uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.current_account() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  update public.devices set status = 'revoked', revoked_at = now() where id = target and account_id = public.current_account() and status <> 'revoked';
  if not found then raise exception 'device not found'; end if; end $$;

-- Optimistic-concurrency push. Same version rules as the tested TypeScript Server stand-in in packages/core/test/sync.test.ts.
create function public.sync_push(recs jsonb) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare acc uuid := public.current_account(); dev uuid; r jsonb; ex public.sync_records; res jsonb := '[]'; del boolean; begin
  if acc is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if jsonb_typeof(recs) <> 'array' or jsonb_array_length(recs) > 200 then raise exception 'bad batch'; end if;
  select id into dev from public.devices where auth_uid = auth.uid();
  for r in select value from jsonb_array_elements(recs) loop
    del := coalesce((r->>'deleted')::boolean, false);
    select * into ex from public.sync_records where account_id = acc and tbl = r->>'tbl' and id = r->>'id' for update;
    if not found then
      insert into public.sync_records(account_id, tbl, id, data, deleted, device_id) values (acc, r->>'tbl', r->>'id', r->'data', del, dev);
      res := res || jsonb_build_object('tbl', r->>'tbl', 'id', r->>'id', 'status', 'ok', 'version', 1);
    elsif ex.data = r->'data' and ex.deleted = del then
      res := res || jsonb_build_object('tbl', ex.tbl, 'id', ex.id, 'status', 'ok', 'version', ex.version);
    elsif ex.version = (r->>'base_version')::bigint then
      update public.sync_records set data = r->'data', deleted = del, version = ex.version + 1, seq = nextval('public.sync_seq'), updated_at = now(), device_id = dev
        where account_id = acc and tbl = ex.tbl and id = ex.id;
      res := res || jsonb_build_object('tbl', ex.tbl, 'id', ex.id, 'status', 'ok', 'version', ex.version + 1);
    else
      res := res || jsonb_build_object('tbl', ex.tbl, 'id', ex.id, 'status', 'conflict', 'version', ex.version, 'data', ex.data, 'deleted', ex.deleted);
    end if;
  end loop; return res; end $$;

revoke all on all functions in schema public from public, anon;
grant execute on function public.current_account(), public.bootstrap_device(text), public.pair_create(), public.pair_redeem(text, text),
  public.pair_approve(uuid), public.revoke_device(uuid), public.sync_push(jsonb) to authenticated;
