-- ─── Multi-tenancy, stage 4: two defects in my own 010/011 ────────────────────
--
-- Both found by running the app and the DB rather than by re-reading the SQL.
--
-- 1. `tenants` was created in 010 without RLS. Supabase grants anon and
--    authenticated on public tables by default, so RLS is the only thing
--    standing between the anon key and a table — and it was off. An anonymous
--    caller could INSERT a tenant (verified: it created one). Beyond the junk
--    row, that is a denial of service on the public portal: current_tenant()'s
--    no-header fallback only answers while exactly one active tenant exists, so
--    inserting a second one blanks every hotel's public site.
--
-- 2. current_tenant()'s fallback was invalid SQL:
--
--      select id into t from tenants where is_active having count(*) = 1;
--
--    `id` is neither grouped nor aggregated, so Postgres raised 42803 every
--    time an anonymous visitor hit the portal. The policy could not evaluate,
--    and the portal showed zero rooms. It never worked; the earlier passing
--    tests all ran as signed-in users, who return on the get_my_tenant() branch
--    above it and never reach this line.

-- The row the hole let in.
delete from tenants where slug = 'jahat';

-- ─── 1. Lock the tenants table ────────────────────────────────────────────────
alter table tenants enable row level security;

-- No anon policy at all: nothing in the app reads this table as an anonymous
-- visitor. current_tenant() resolves the slug inside SECURITY DEFINER, where
-- RLS does not apply, so the public portal keeps working with the table sealed.
drop policy if exists "Members can view own tenant" on tenants;
create policy "Members can view own tenant" on tenants for select
  using (id = get_my_tenant());

-- Creating, renaming, or deactivating a hotel is an operator action performed
-- under the service role, which bypasses RLS entirely. Granting it to admins
-- would let a tenant admin mint tenants; granting it to anon was the bug.
-- Deliberately: no INSERT, UPDATE, or DELETE policy exists.

-- ─── 2. Fix the fallback ──────────────────────────────────────────────────────
create or replace function current_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t   uuid;
  hdr text;
  n   int;
begin
  -- Signed in: authoritative, from their profile.
  t := get_my_tenant();
  if t is not null then
    return t;
  end if;

  -- Anonymous: whichever hotel's portal they are browsing.
  begin
    hdr := nullif(current_setting('request.headers', true)::json ->> 'x-tenant-slug', '');
  exception when others then
    hdr := null;
  end;

  if hdr is not null then
    select id into t from tenants where slug = hdr and is_active;
    return t;
  end if;

  -- No header, no session. While exactly one hotel lives here it is
  -- unambiguously the one being browsed, which keeps the portal working without
  -- every caller announcing itself. With two or more the question has no honest
  -- answer, so deny rather than guess.
  select count(*) into n from tenants where is_active;
  if n <> 1 then
    return null;
  end if;

  select id into t from tenants where is_active;
  return t;
end;
$$;

revoke all on function current_tenant() from public;
grant execute on function current_tenant() to anon, authenticated, service_role;
