-- ─── Multi-tenancy, stage 5: a new arrival needs a tenant ─────────────────────
--
-- 010 made profiles.tenant_id NOT NULL and deliberately left profiles out of
-- the set_tenant_id() trigger, on the reasoning that a profile is created by
-- the SSO exchange before the caller has a tenant to read. True — but I never
-- gave the exchange another way to supply one, so api/_lib/provision.ts:110,
-- which inserts a profile without tenant_id, now fails the not-null constraint.
-- Every first-time SSO login was locked out. Verified against the real table.
--
-- The honest fix is for the exchange to say which hotel the user is signing
-- into, resolved from the portal host. That is real work and belongs with the
-- rest of the host→tenant mapping. Until then this default answers the question
-- the same way current_tenant() does for an anonymous visitor: while exactly
-- one hotel lives here, that hotel is the answer.
--
-- With two or more tenants it returns null and the insert fails loudly on the
-- not-null constraint. That is intentional. A wrong default here does not throw
-- an error — it silently files a guest under the wrong hotel and hands them
-- someone else's data. Fail closed and make provision.ts pass tenant_id
-- explicitly before onboarding a second hotel.

create or replace function default_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t uuid;
  n int;
begin
  select count(*) into n from tenants where is_active;
  if n <> 1 then
    return null;
  end if;
  select id into t from tenants where is_active;
  return t;
end;
$$;

revoke all on function default_tenant() from public;
grant execute on function default_tenant() to anon, authenticated, service_role;

alter table profiles alter column tenant_id set default default_tenant();
