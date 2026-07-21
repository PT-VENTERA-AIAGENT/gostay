-- GoStay HMS — RLS regression test, part 1 of 2: setup. Run as the superuser.
-- See run.sh. Use a THROWAWAY database: this seeds rows and mutates them.

-- ─── Stand-in for the parts of Supabase the migrations depend on ─────────────
-- Only what 001-005 actually touch. Must run BEFORE the migrations: the default
-- privileges below apply to tables created after this point.
create schema if not exists auth;

create table if not exists auth.users (id uuid primary key, email text);

-- Supabase reads the verified JWT from a GUC. Same contract here, so the
-- policies under test evaluate the exact expression they run in production.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  -- What PostgREST connects as. The attack script logs in as this and SET ROLEs
  -- per request, so session_user is never the superuser.
  if not exists (select 1 from pg_roles where rolname='authenticator') then
    create role authenticator login password 'pw' noinherit;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
