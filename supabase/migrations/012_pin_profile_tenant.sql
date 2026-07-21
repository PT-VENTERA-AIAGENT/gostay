-- ─── Multi-tenancy, stage 3: pin the tenant on a profile ──────────────────────
--
-- Found by the cross-tenant test in supabase/tests/, not by reading the policy.
--
-- "Users can update own profile" is `using (id = auth.uid()) with check (id =
-- auth.uid())` — correct before tenancy, and a full breach after it. tenant_id
-- was just another column on a row the user is allowed to update, so:
--
--   update profiles set tenant_id = '<rival>' where id = auth.uid();
--
-- succeeded. get_my_tenant() then returned the rival's id, and every policy
-- written in 011 — all of which trust get_my_tenant() — dutifully handed over
-- that hotel's bookings, guests, chats and revenue. One UPDATE, total crossover.
--
-- Fixing it in the policy would need the predicate repeated on both self-update
-- and admin-update, and would still miss any future policy. The guard trigger
-- from 005 already exists for exactly this class of column, already runs on
-- every UPDATE, and already exempts the service role. tenant_id belongs in it.
--
-- Note this denies *admins* too, deliberately. An admin re-homing a profile is
-- indistinguishable from an admin walking into another hotel; moving a user
-- between tenants is an operator action, done under the service role.

create or replace function guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if is_privileged_context() then
    return new;
  end if;

  -- get_my_role() is STABLE, so it reads the pre-update snapshot: an admin
  -- demoting themselves is still an admin for the duration of the statement.
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active)
     and get_my_role() is distinct from 'admin' then
    raise exception 'only an admin may change role or is_active'
      using errcode = '42501';
  end if;

  -- The identity is derived from the SSO subject by api/_lib/identity.ts.
  -- Re-pointing it would let a user inherit another profile's rows.
  if new.id is distinct from old.id or new.sso_sub is distinct from old.sso_sub then
    raise exception 'id and sso_sub are derived from the SSO subject and cannot be changed'
      using errcode = '42501';
  end if;

  -- The tenant is the security boundary itself. Nobody re-homes a profile from
  -- inside the application, whatever their role.
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on profiles;
create trigger guard_profile_privileged_columns
  before update on profiles
  for each row execute function guard_profile_privileged_columns();
