-- ─── Multi-tenancy, stage 1: the scoping column ───────────────────────────────
--
-- Model: one tenant = one hotel; many staff and many guests live inside a
-- tenant; nobody belongs to two. That is the simplest shape that holds, and it
-- keeps every policy predicate to a single equality (see 011).
--
-- This migration only moves the schema. It deliberately does NOT touch RLS —
-- the policies are rewritten in 011. Between the two migrations the database is
-- tenant-aware but not yet tenant-enforcing, so they must ship together.
--
-- Ordering note: tenant_id is added nullable, backfilled to a default tenant,
-- and only then set NOT NULL. Adding it NOT NULL outright would fail against
-- the existing rows.

-- ─── The tenant ───────────────────────────────────────────────────────────────
create table if not exists tenants (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  slug       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every existing row predates tenancy and belongs to the hotel this database
-- was built for. Pin the id so the backfill below is deterministic and re-runs
-- cleanly rather than minting a second "default" tenant.
insert into tenants (id, name, slug)
values ('00000000-0000-4000-8000-000000000001'::uuid, 'GoStay Hotel', 'gostay')
on conflict (id) do nothing;

-- ─── The scoping column, on every tenant-owned table ──────────────────────────
do $$
declare
  t text;
  tenant_tables text[] := array[
    'profiles', 'room_types', 'rooms', 'seasonal_pricing', 'availability_blocks',
    'customers', 'bookings', 'booking_audit_log', 'chat_threads', 'chat_messages',
    'call_logs', 'analytics_cache', 'reviews'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table %I add column if not exists tenant_id uuid references tenants(id) on delete cascade', t);
    execute format('update %I set tenant_id = %L where tenant_id is null', t, '00000000-0000-4000-8000-000000000001');
    execute format('alter table %I alter column tenant_id set not null', t);
    -- Every RLS predicate in 011 filters on tenant_id; without these each one is
    -- a sequential scan.
    execute format('create index if not exists %I on %I (tenant_id)', 'idx_' || t || '_tenant', t);
  end loop;
end $$;

-- ─── Uniqueness was global; it has to become per-tenant ───────────────────────
-- Two hotels both having a room "101" is normal, and a global unique index made
-- the second hotel's insert fail. Same for a "deluxe" slug.
alter table rooms       drop constraint if exists rooms_number_key;
alter table room_types  drop constraint if exists room_types_slug_key;
create unique index if not exists rooms_tenant_number_key      on rooms       (tenant_id, number);
create unique index if not exists room_types_tenant_slug_key   on room_types  (tenant_id, slug);

-- analytics_cache keyed on (date, metric_key) alone meant tenant B's nightly
-- rollup would overwrite tenant A's figure for the same day. This one is a
-- silent data-corruption bug, not just a failed insert.
alter table analytics_cache drop constraint if exists analytics_cache_unique;
create unique index if not exists analytics_cache_tenant_unique
  on analytics_cache (tenant_id, date, metric_key);

-- bookings.reference stays globally unique on purpose: it is a public-facing
-- identifier a guest reads over the phone, and global uniqueness is a strict
-- superset of per-tenant uniqueness — no correctness risk, and it keeps
-- reference lookups from ever needing a tenant to disambiguate.

-- ─── Reading the caller's tenant ──────────────────────────────────────────────
-- Mirrors get_my_role() (005): SECURITY DEFINER so the lookup itself is not
-- subject to the profiles policy it is used to build, search_path pinned so a
-- caller cannot shadow `profiles` with a temp table and choose their own tenant.
create or replace function get_my_tenant()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tenant_id from profiles where id = auth.uid() and is_active;
$$;

revoke all on function get_my_tenant() from public;
grant execute on function get_my_tenant() to anon, authenticated, service_role;

-- ─── Defence in depth: the client never gets to pick its tenant ───────────────
-- 011's WITH CHECK rejects a mismatched tenant_id, but relying on the client to
-- send the right one means every insert site is a place to forget. Stamping it
-- server-side makes the correct value the default and the policy the backstop.
create or replace function set_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tenant_id is null then
    new.tenant_id := get_my_tenant();
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  -- profiles is omitted: a profile is created by the SSO exchange under the
  -- service role, before the caller has a tenant to read. Its tenant is
  -- assigned explicitly there, not inferred.
  stamped text[] := array[
    'room_types', 'rooms', 'seasonal_pricing', 'availability_blocks',
    'customers', 'bookings', 'booking_audit_log', 'chat_threads', 'chat_messages',
    'call_logs', 'analytics_cache', 'reviews'
  ];
begin
  foreach t in array stamped loop
    execute format('drop trigger if exists trg_set_tenant_id on %I', t);
    execute format(
      'create trigger trg_set_tenant_id before insert on %I for each row execute function set_tenant_id()', t);
  end loop;
end $$;
