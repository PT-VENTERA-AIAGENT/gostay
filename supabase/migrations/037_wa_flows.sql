-- WhatsApp conversation flows — a hotel's own chatbot script, stored as a node
-- graph and drawn on a canvas in the console (the same shape of change the denah
-- made for room layouts: the format is owned by the client, the DB owns tenancy).
--
-- Why this exists. Until now every WhatsApp branch was a hardcoded keyword list
-- compiled into api/_lib/wa (ROOM_SERVICE_HINTS, DEFAULT_GREETING_TRIGGERS,
-- AVAILABILITY_HINTS), each with its own matching rule and an order fixed by the
-- if-chain in converse.ts. That made two things impossible: a hotel could not
-- change a single word without a deploy, and overlapping keywords had no
-- principled winner — the case that broke was "menu", which every guest types
-- but which meant the room-service list to someone staying and "what do you
-- offer?" to someone still shopping.
--
-- ─── The part that is NOT in Chatly ──────────────────────────────────────────
-- Chatly picks a flow from keywords alone. That is not enough here: the SAME
-- word has to reach different flows depending on whether the guest is actually
-- staying. So a flow also declares the guest state it needs (`requires`), and
-- flow selection treats an unmet requirement as "no match" and keeps looking —
-- which is what lets "menu" open room service for an in-house guest and fall
-- through to the greeting for everyone else, with no special-casing in code.

-- ─── 1. What a flow can demand of the guest before it will start ──────────────
-- 'none'    — anyone, including a stranger on first contact.
-- 'inhouse' — only a guest with a checked_in booking at this hotel. Room service
--             is the case: the guest must be staying before ordering, matching
--             migration 021's RLS on guest_requests and the portal's own rule.
-- New values are addable later (`alter type ... add value`) without touching the
-- stored graphs.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'wa_flow_requirement') then
    create type wa_flow_requirement as enum ('none', 'inhouse');
  end if;
end
$$;

-- ─── 2. The table ─────────────────────────────────────────────────────────────
create table if not exists wa_flows (
  id               uuid primary key default uuid_generate_v4(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  name             text not null,
  description      text,

  -- Words that start this flow. Matched by a tiered scorer (exact > whole-word >
  -- substring) rather than a bare `includes`, so "menu" cannot be triggered by
  -- "menunggu" / "menuju" — the false-positive class a substring rule invites in
  -- Indonesian, where many everyday words share a prefix with a trigger.
  trigger_keywords text[] not null default '{}',

  -- Guest state this flow needs before it may start. See the enum above.
  requires         wa_flow_requirement not null default 'none',

  -- Tie-break when several flows match equally well. LOWER runs first, so a
  -- hotel can force an ordering without renaming anything. Ties fall back to
  -- name so selection is always deterministic — never `Array.find` order.
  priority         integer not null default 100,

  -- { version, nodes: [...], edges: [...] } — see src/types/waFlow.ts. Opaque to
  -- Postgres on purpose: the node vocabulary evolves on the client, and the
  -- engine coerces defensively rather than trusting the column.
  definition       jsonb not null default '{"version":1,"nodes":[],"edges":[]}'::jsonb,

  -- Draft flows stay out of the matcher entirely, so a half-drawn graph can be
  -- saved without answering live guests with it.
  is_active        boolean not null default false,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- One name per hotel: the console lists by name, and duplicates make the
  -- priority tie-break ambiguous.
  constraint wa_flows_tenant_name_key unique (tenant_id, name)
);

create index if not exists idx_wa_flows_tenant on wa_flows (tenant_id);

-- The matcher's hot path: every inbound message asks for one tenant's active
-- flows in precedence order. Ordering the index the same way lets that read be
-- served without a sort.
create index if not exists idx_wa_flows_active
  on wa_flows (tenant_id, priority, name)
  where is_active;

-- ─── 3. Server-side stamping (matches every other tenant table, 010) ──────────
drop trigger if exists trg_set_tenant_id on wa_flows;
create trigger trg_set_tenant_id
  before insert on wa_flows
  for each row execute function set_tenant_id();

drop trigger if exists trg_wa_flows_updated_at on wa_flows;
create trigger trg_wa_flows_updated_at
  before update on wa_flows
  for each row execute function set_updated_at();

-- ─── 4. RLS: a hotel's staff/admin own their script ───────────────────────────
alter table wa_flows enable row level security;

-- Internal operations data, like the denah — no anonymous read. The webhook runs
-- under the service role, which bypasses RLS entirely, so the engine is
-- unaffected by these policies; they exist to scope the CONSOLE.
drop policy if exists "Staff/admin can view own wa flows" on wa_flows;
create policy "Staff/admin can view own wa flows" on wa_flows for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

-- Staff may edit the script, not just admin — same call as the denah (025). The
-- blast radius is the hotel's own replies; it confers no booking or money power.
drop policy if exists "Staff/admin can manage own wa flows" on wa_flows;
create policy "Staff/admin can manage own wa flows" on wa_flows for all
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());
