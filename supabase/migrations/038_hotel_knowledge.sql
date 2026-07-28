-- The hotel's own answers, in the hotel's own words.
--
-- Why this exists. The WhatsApp assistant could already look up rooms, rates and
-- availability, but everything ELSE a guest asks — is there a prayer room, can we
-- bring a pet, what time is breakfast, is there an airport shuttle — had no
-- source of truth. A model asked those questions without one does not say "I
-- don't know"; it invents a plausible answer, and it invents a DIFFERENT
-- plausible answer next time. Two guests get two policies, and the hotel finds
-- out at the front desk.
--
-- So: facts live here, written by staff, and the assistant may only answer from
-- what it is given. Retrieval is deterministic keyword scoring rather than
-- embeddings — the same question must return the same passage every time, which
-- is exactly the "jangan berubah-ubah" requirement. Embeddings would also mean a
-- second API dependency on the hot path of every inbound message.

create table if not exists hotel_knowledge (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,

  -- A short label staff recognise in a list ("Jam check-in", "Sarapan").
  topic      text not null,

  -- The answer, verbatim. Sent to the guest close to as-written, so it should
  -- read as a complete reply rather than as a note to self.
  content    text not null,

  -- Extra words that should reach this entry but do not appear in the topic —
  -- "wifi" for an entry titled "Internet", regional spellings, common typos.
  -- Scored the same way flow triggers are.
  keywords   text[] not null default '{}',

  -- Draft entries stay out of retrieval, so a half-written policy is never
  -- quoted to a guest.
  is_active  boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One entry per topic per hotel: duplicates make retrieval ambiguous and give
  -- the inconsistency this table exists to remove.
  constraint hotel_knowledge_tenant_topic_key unique (tenant_id, topic)
);

create index if not exists idx_hotel_knowledge_tenant on hotel_knowledge (tenant_id);

-- The retrieval hot path: one tenant's active entries, every inbound question.
create index if not exists idx_hotel_knowledge_active
  on hotel_knowledge (tenant_id) where is_active;

-- ─── Server-side stamping (matches every other tenant table, 010) ────────────
drop trigger if exists trg_set_tenant_id on hotel_knowledge;
create trigger trg_set_tenant_id
  before insert on hotel_knowledge
  for each row execute function set_tenant_id();

drop trigger if exists trg_hotel_knowledge_updated_at on hotel_knowledge;
create trigger trg_hotel_knowledge_updated_at
  before update on hotel_knowledge
  for each row execute function set_updated_at();

-- ─── RLS: a hotel's staff own their answers ──────────────────────────────────
alter table hotel_knowledge enable row level security;

-- No anonymous read. The webhook runs service-role and bypasses RLS entirely, so
-- these policies scope the CONSOLE, not the assistant.
drop policy if exists "Staff/admin can view own knowledge" on hotel_knowledge;
create policy "Staff/admin can view own knowledge" on hotel_knowledge for select
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant());

drop policy if exists "Staff/admin can manage own knowledge" on hotel_knowledge;
create policy "Staff/admin can manage own knowledge" on hotel_knowledge for all
  using (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
         and tenant_id = get_my_tenant())
  with check (get_my_role() = any (array['admin'::user_role, 'staff'::user_role])
              and tenant_id = get_my_tenant());
