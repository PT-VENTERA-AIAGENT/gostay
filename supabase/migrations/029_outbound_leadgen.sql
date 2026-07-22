-- Lead generation outbound system: scrape → generate → preview → approve → send
-- Admin-only tables. RLS enabled, single policy: only role='admin' may access.

-- ── outbound_leads ────────────────────────────────────────────────────────────
-- One row per scraped business. gmaps_place_id is the dedup key so re-scraping
-- the same area never creates duplicate rows.

create table outbound_leads (
  id              uuid        primary key default gen_random_uuid(),
  source          text        not null default 'google_maps',
  business_name   text        not null,
  phone_wa        text,                             -- e164-ish: 628xxx (no JID suffix)
  address         text,
  city            text,
  province        text,
  category        text,                             -- villa | hotel | guest_house | penginapan
  rating          numeric(2,1),
  review_count    int,
  gmaps_url       text,
  gmaps_place_id  text        unique,               -- dedupe scraping
  booking_price_min int,                            -- IDR, from enrichment
  booking_price_max int,
  estimated_rooms int,
  status          text        not null default 'new',
  -- new | contacted | replied | qualified | demo_booked | trial | paying
  -- | not_interested | unresponsive
  assigned_to     uuid        references profiles(id),
  last_contacted_at timestamptz,
  follow_up_at    timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on outbound_leads(status);
create index on outbound_leads(city);
create index on outbound_leads(category);
create index on outbound_leads(follow_up_at) where status = 'contacted';

create trigger set_outbound_leads_updated_at
  before update on outbound_leads
  for each row execute function update_updated_at_column();

alter table outbound_leads enable row level security;

create policy "admin_all_outbound_leads"
  on outbound_leads
  for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');


-- ── outbound_wa_conversations ─────────────────────────────────────────────────
-- Full audit log of every WA message sent to or received from a lead.
-- wa_message_id is unique so inbound retries are idempotent.

create table outbound_wa_conversations (
  id            uuid        primary key default gen_random_uuid(),
  lead_id       uuid        not null references outbound_leads(id) on delete cascade,
  phone_jid     text        not null,
  direction     text        not null check (direction in ('outbound', 'inbound')),
  message       text        not null,
  wa_message_id text        unique,                 -- idempotency for inbound
  action_taken  text,                               -- send_trial_link | book_demo | escalate | close | continue
  sent_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index on outbound_wa_conversations(lead_id);
create index on outbound_wa_conversations(phone_jid);

alter table outbound_wa_conversations enable row level security;

create policy "admin_all_outbound_conversations"
  on outbound_wa_conversations
  for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');


-- ── outbound_message_drafts ───────────────────────────────────────────────────
-- Claude-generated message drafts awaiting admin approval before send.
-- One active draft per lead at a time; approved=true means admin ok'd it.
-- sent=true means it was dispatched to wa-ventera.

create table outbound_message_drafts (
  id             uuid        primary key default gen_random_uuid(),
  lead_id        uuid        not null references outbound_leads(id) on delete cascade,
  campaign_id    uuid,                              -- FK added after outbound_campaigns
  message        text        not null,
  model          text        not null default 'claude-sonnet-4-6',
  approved       boolean     not null default false,
  sent           boolean     not null default false,
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index on outbound_message_drafts(lead_id);
create index on outbound_message_drafts(approved, sent) where not sent;

alter table outbound_message_drafts enable row level security;

create policy "admin_all_outbound_drafts"
  on outbound_message_drafts
  for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');


-- ── outbound_campaigns ───────────────────────────────────────────────────────
-- A campaign ties a batch of leads to a message generation + approval + send run.

create table outbound_campaigns (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  status          text        not null default 'draft',
  -- draft | generating | pending_approval | sending | paused | completed
  filters         jsonb       not null default '{}',
  -- { category, city, province, rating_min, rating_max, review_min }
  daily_limit     int         not null default 100,
  total_leads     int         not null default 0,
  total_generated int         not null default 0,
  total_sent      int         not null default 0,
  total_replied   int         not null default 0,
  total_converted int         not null default 0,
  created_by      uuid        references profiles(id),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_outbound_campaigns_updated_at
  before update on outbound_campaigns
  for each row execute function update_updated_at_column();

alter table outbound_campaigns enable row level security;

create policy "admin_all_outbound_campaigns"
  on outbound_campaigns
  for all
  using (get_my_role() = 'admin')
  with check (get_my_role() = 'admin');

-- Back-fill FK on drafts now that campaigns table exists
alter table outbound_message_drafts
  add constraint outbound_message_drafts_campaign_id_fkey
  foreign key (campaign_id) references outbound_campaigns(id) on delete set null;

create index on outbound_message_drafts(campaign_id);
