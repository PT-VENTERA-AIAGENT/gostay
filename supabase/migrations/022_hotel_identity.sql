-- Hotel identity: let a hotel's own staff fill in and edit its public profile
-- (name, contact, description, logo). 013 deliberately left tenants read-only
-- because renaming was a platform-operator action — but a hotel maintaining its
-- OWN brochure is a legitimate self-service. So we open UPDATE narrowly: a
-- member may edit their own tenant's identity columns only, while slug,
-- is_active and id stay operator-controlled (a guard trigger freezes them).

-- ─── 1. Identity columns ──────────────────────────────────────────────────────
alter table tenants
  add column if not exists address     text,
  add column if not exists phone       text,
  add column if not exists email       text,
  add column if not exists description text,
  add column if not exists logo_url    text;

-- ─── 2. Freeze the operator-owned columns on any client update ────────────────
-- Same pattern as guard_profile_privileged_columns (012): the service role
-- (is_privileged_context) bypasses; everyone else is blocked from moving the
-- identifier (slug), the on/off switch (is_active), or the id.
create or replace function guard_tenant_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if is_privileged_context() then
    return new;
  end if;
  if new.slug is distinct from old.slug
     or new.is_active is distinct from old.is_active
     or new.id is distinct from old.id then
    raise exception 'slug, is_active and id are managed by the platform operator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_tenant_privileged_columns on tenants;
create trigger guard_tenant_privileged_columns
  before update on tenants
  for each row execute function guard_tenant_privileged_columns();

-- ─── 3. A member may update their OWN tenant's identity ────────────────────────
-- Scoped to the caller's tenant (id = get_my_tenant()) and to staff/admin — a
-- customer of the hotel cannot edit its profile. The guard trigger above is what
-- keeps this from also becoming a slug/is_active write.
drop policy if exists "Staff can update own tenant identity" on tenants;
create policy "Staff can update own tenant identity" on tenants for update
  using (id = get_my_tenant() and get_my_role() in ('staff'::user_role, 'admin'::user_role))
  with check (id = get_my_tenant());
