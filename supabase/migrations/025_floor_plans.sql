-- Site plan (denah) per hotel: a top-down canvas of the property that a hotel's
-- own staff draw and maintain — buildings/rooms, gardens, pool, mosque, roads,
-- parking, and freeform custom shapes. It is a visual layer, not a booking
-- source: a "room" element may LINK to a real rooms row (data.elements[].roomId)
-- so the plan can reflect availability, but the bookable rooms themselves are
-- still created and deleted through the room manager. Nothing here is bookable.
--
-- One plan per hotel, stored whole as JSON. The shape is intentionally opaque to
-- Postgres (jsonb) because the canvas format evolves on the client — the DB only
-- owns tenancy, ownership, and a single-row-per-tenant guarantee.

-- ─── 1. The table ─────────────────────────────────────────────────────────────
create table if not exists floor_plans (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  -- { version, width, height, gridSize, elements: [...] } — see src/types/floorPlan.ts
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- One plan per hotel. Also the upsert conflict target the client relies on.
  constraint floor_plans_tenant_key unique (tenant_id)
);

create index if not exists idx_floor_plans_tenant on floor_plans (tenant_id);

-- ─── 2. Stamp tenant_id server-side (matches every other tenant table, 010) ────
-- set_tenant_id() fills tenant_id from the caller's profile when the client
-- omits it, so the correct value is the default and the RLS CHECK is the
-- backstop rather than the only line of defence.
drop trigger if exists trg_set_tenant_id on floor_plans;
create trigger trg_set_tenant_id
  before insert on floor_plans
  for each row execute function set_tenant_id();

-- Keep updated_at honest on every write.
drop trigger if exists trg_floor_plans_updated_at on floor_plans;
create trigger trg_floor_plans_updated_at
  before update on floor_plans
  for each row execute function set_updated_at();

-- ─── 3. RLS: a hotel's staff/admin own their plan; nobody else sees it ─────────
alter table floor_plans enable row level security;

-- The site plan is internal operations data (unlike room_types/rooms it is not
-- part of the public brochure), so there is no anonymous/current_tenant() read —
-- only signed-in staff and admin of the owning tenant.
drop policy if exists "Staff/admin can view own floor plan" on floor_plans;
create policy "Staff/admin can view own floor plan" on floor_plans for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

-- Staff may maintain the denah (the operator asked for staff-editable), not just
-- admin — this is deliberately broader than "Admin can manage rooms". It still
-- cannot touch the rooms table, so it grants no booking power.
drop policy if exists "Staff/admin can manage own floor plan" on floor_plans;
create policy "Staff/admin can manage own floor plan" on floor_plans for all
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());
