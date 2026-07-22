-- ─── Role model, stage: a hotel is run by its own staff ───────────────────────
--
-- The canonical role model (PRD §2, api/_lib/admin/platform-auth.ts):
--   admin    = Ventera, the platform operator. The ONLY admin, cross-tenant.
--   staff    = a hotel's own people (owner + employees). One tenant.
--   customer = a guest of one hotel.
--
-- Migrations 005/011 keyed a hotel's day-to-day management (rooms, pricing,
-- availability, room photos) and its user management on `admin`. Under the model
-- above that is wrong: `admin` is Ventera, so a hotel could never manage itself.
-- Those powers belong to `staff`, scoped to their own tenant. `admin` stays in
-- the set so Ventera can still act inside a tenant if it ever must; its real
-- cross-tenant reach is the service-role platform endpoints, not these policies.
--
-- Idempotent: drops each policy by name before recreating it.

-- ─── 1. Room inventory, pricing, availability → the hotel's staff ─────────────
drop policy if exists "Admin can manage room types" on room_types;
drop policy if exists "Hotel can manage room types" on room_types;
create policy "Hotel can manage room types" on room_types for all
  using  (get_my_role() = any (array['admin','staff']::user_role[]) and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin','staff']::user_role[]) and tenant_id = get_my_tenant());

drop policy if exists "Admin can manage rooms" on rooms;
drop policy if exists "Hotel can manage rooms" on rooms;
create policy "Hotel can manage rooms" on rooms for all
  using  (get_my_role() = any (array['admin','staff']::user_role[]) and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin','staff']::user_role[]) and tenant_id = get_my_tenant());

drop policy if exists "Admin can manage seasonal pricing" on seasonal_pricing;
drop policy if exists "Hotel can manage seasonal pricing" on seasonal_pricing;
create policy "Hotel can manage seasonal pricing" on seasonal_pricing for all
  using  (get_my_role() = any (array['admin','staff']::user_role[]) and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin','staff']::user_role[]) and tenant_id = get_my_tenant());

drop policy if exists "Admin can manage blocks" on availability_blocks;
drop policy if exists "Hotel can manage blocks" on availability_blocks;
create policy "Hotel can manage blocks" on availability_blocks for all
  using  (get_my_role() = any (array['admin','staff']::user_role[]) and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin','staff']::user_role[]) and tenant_id = get_my_tenant());

-- Room photos ride on storage.objects RLS (no tenant column on the bucket; the
-- object path carries the tenant). Staff of a hotel may manage their photos.
drop policy if exists "Admin upload room photos" on storage.objects;
drop policy if exists "Hotel upload room photos" on storage.objects;
create policy "Hotel upload room photos" on storage.objects for insert
  with check (bucket_id = 'room-photos'
              and public.get_my_role() = any (array['admin','staff']::user_role[]));

drop policy if exists "Admin delete room photos" on storage.objects;
drop policy if exists "Hotel delete room photos" on storage.objects;
create policy "Hotel delete room photos" on storage.objects for delete
  using (bucket_id = 'room-photos'
         and public.get_my_role() = any (array['admin','staff']::user_role[]));

-- ─── 2. User Management is per-hotel ──────────────────────────────────────────
-- A hotel's staff manage their OWN hotel's team: add (by promoting an existing
-- customer), adjust between staff/customer, and deactivate. Two hard limits,
-- enforced twice (RLS + the column-guard trigger, since RLS has no column
-- granularity): they can never touch an `admin` row, and never grant `admin`.
-- The existing "Admin can update any profile" (011) still handles Ventera.
drop policy if exists "Staff can manage team in own tenant" on profiles;
create policy "Staff can manage team in own tenant" on profiles for update
  using  (get_my_role() = 'staff'::user_role
          and tenant_id = get_my_tenant()
          and role <> 'admin'::user_role)
  with check (get_my_role() = 'staff'::user_role
              and tenant_id = get_my_tenant()
              and role <> 'admin'::user_role);

-- Extend the column guard (005 → 012) so staff may move role/is_active within
-- their team, but never to or from `admin`. id/sso_sub and tenant_id stay
-- immutable from inside the app; re-homing a profile is a service-role action.
create or replace function guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  myrole user_role;
begin
  if is_privileged_context() then
    return new;
  end if;

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

  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    -- get_my_role() is STABLE, so it reads the pre-update snapshot.
    myrole := get_my_role();
    if myrole = 'admin'::user_role then
      -- Ventera: unrestricted.
      null;
    elsif myrole = 'staff'::user_role
          and old.role <> 'admin'::user_role
          and new.role <> 'admin'::user_role then
      -- A hotel's staff managing their own team. RLS has already pinned the row
      -- to their tenant; the two `<> admin` guards keep them from touching or
      -- minting an admin.
      null;
    else
      raise exception 'only an admin may grant or change the admin role'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on profiles;
create trigger guard_profile_privileged_columns
  before update on profiles
  for each row execute function guard_profile_privileged_columns();
