-- GoStay HMS — balance/payout ("tarik saldo") trigger test: prerequisites.
-- Run as the superuser on a THROWAWAY database (see run_balance.sh).
--
-- The point of this file is to let migrations 030 + 031 be applied VERBATIM —
-- so the balance-credit / payout-hold / reversal triggers under test are the
-- exact production code, not a copy that can drift. It stands in ONLY for the
-- objects 030/031 reference from earlier migrations: the tenancy enum + helpers,
-- and the four tables the new FKs point at (tenants, profiles, bookings,
-- payments). Everything else 030/031 create themselves.

create extension if not exists "uuid-ossp";

-- Tenancy role type + helpers (real ones live in 001/011; 030/031 RLS casts to
-- user_role and calls get_my_role()/get_my_tenant()). Stubbed to satisfy the
-- policy expressions — RLS itself is exercised by attacks.sql, not here.
do $$ begin
  if not exists (select 1 from pg_type where typname='user_role') then
    create type user_role as enum ('admin','staff','customer');
  end if;
end $$;

create or replace function get_my_role() returns user_role
  language sql stable as $$ select 'admin'::user_role $$;
create or replace function get_my_tenant() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'tenant', '')::uuid
  $$;

-- Payouts carry a set_tenant_id() BEFORE-insert trigger (defined in 011). Here we
-- only need tenant_id populated for the money math, so keep any value already
-- supplied and fall back to the JWT tenant otherwise.
create or replace function set_tenant_id() returns trigger
  language plpgsql as $$
begin
  new.tenant_id := coalesce(new.tenant_id, get_my_tenant());
  return new;
end $$;

-- FK targets. Minimal shape — only the columns 030/031 touch.
create table if not exists tenants  (id uuid primary key default uuid_generate_v4(), name text);
create table if not exists profiles (id uuid primary key default uuid_generate_v4());
create table if not exists bookings (
  id        uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id)
);
-- 030 ALTERs this table (adds gateway columns), and the credit trigger fires on
-- insert into it, so it must exist before 030 runs.
create table if not exists payments (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id),
  booking_id uuid references bookings(id),
  amount     numeric(14,2) not null,
  method     text,
  note       text,
  created_at timestamptz not null default now()
);

-- A numeric-aware sibling of tests.eq (that one takes bigint; balances are
-- numeric(14,2)). Compares to two decimals so a rounding drift can't hide.
create schema if not exists tests;
create or replace function tests.eqn(label text, got numeric, want numeric)
returns text language sql as $$
  select case when round(got,2) = round(want,2)
              then 'pass  ' || label || ' = ' || got
              else 'FAIL <-- ' || label || ' = ' || got || ', want ' || want end
$$;
