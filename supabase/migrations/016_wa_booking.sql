-- ─── WhatsApp AI booking, stage 1: the supporting tables ──────────────────────
--
-- Backing store for the WhatsApp booking flow (plan: whatsapp-ai-booking, Fase 2).
-- A guest chats a hotel's WA number; the webhook (api/wa/inbound.ts, a Vercel Node
-- function) resolves the hotel from the sessionId, provisions the guest, and files
-- a pending booking against the right tenant.
--
-- Trust model — read this before touching RLS below. Every one of these tables is
-- written and read ONLY by the service role (the webhook holds the service key and
-- passes tenant_id explicitly on every statement, the same way the SSO exchange
-- does for profiles). None is ever reached by an anon or authenticated PostgREST
-- caller. So each table has RLS *enabled with no policy at all*: Supabase grants
-- anon/authenticated on public tables by default, and an enabled-but-policyless
-- table denies every one of those grants while the service role bypasses RLS
-- entirely. This is the exact pattern 013 used to seal `tenants` and KasKecil used
-- for `whatsapp_rate_limits` (migration 20260624180000, line 120).
--
-- The tenant of a WhatsApp conversation comes ONLY from the sessionId (the hotel's
-- own number), never from the sender — a spoofed sender must not reach another
-- hotel. Hence tenant_id is an explicit NOT NULL FK on every tenant-owned table
-- here, and identity/pending rows are keyed per (tenant_id, phone_jid): the same
-- number may be a guest at more than one hotel.

-- ─── wa_hotel_sessions — the sessionId → hotel map ────────────────────────────
-- One WA number = one Baileys sessionId = one tenant. The webhook looks a hotel up
-- here; an unknown or inactive session means the bot stays silent (still 200).
create table if not exists wa_hotel_sessions (
  id          uuid primary key default uuid_generate_v4(),
  session_id  text not null unique,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  bot_number  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_wa_hotel_sessions_tenant on wa_hotel_sessions (tenant_id);

alter table wa_hotel_sessions enable row level security;
-- Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.
comment on table wa_hotel_sessions is
  'Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.';

-- ─── wa_guest_identities — a WA number's identity within one hotel ────────────
-- Resolved/provisioned per (tenant_id, phone_jid). sso_sub/profile_id/customer_id
-- are filled in once the guest is provisioned (Ventera → profiles → customers);
-- they are nullable because the identity row can exist before provisioning. The
-- composite unique key lets the same number be a distinct guest at each hotel.
create table if not exists wa_guest_identities (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  phone_jid   text not null,
  sso_sub     text,
  profile_id  uuid,
  customer_id uuid,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  unique (tenant_id, phone_jid)
);

create index if not exists idx_wa_guest_identities_tenant on wa_guest_identities (tenant_id);

alter table wa_guest_identities enable row level security;
-- Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.
comment on table wa_guest_identities is
  'Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.';

-- ─── wa_inbound_messages — idempotency ledger ────────────────────────────────
-- The gateway retries on any non-2xx, so an inbound message can arrive more than
-- once. The unique wa_message_id makes the INSERT the idempotency check: a 23505
-- on insert means "already handled" and the webhook skips it. Not tenant-scoped:
-- it is a raw de-dup ledger keyed on the gateway's own message id.
create table if not exists wa_inbound_messages (
  id            uuid primary key default uuid_generate_v4(),
  wa_message_id text not null unique,
  session_id    text,
  phone_jid     text,
  received_at   timestamptz,
  raw           jsonb,
  created_at    timestamptz not null default now()
);

alter table wa_inbound_messages enable row level security;
-- Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.
comment on table wa_inbound_messages is
  'Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.';

-- ─── wa_pending_actions — confirm-before-write state ─────────────────────────
-- At most one open action per (tenant_id, phone_jid): the summary the guest must
-- confirm with "YA" before anything is written. Short-lived — expires_at defaults
-- to ten minutes out, and the webhook refuses a "YA" against an expired row.
create table if not exists wa_pending_actions (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  phone_jid   text not null,
  kind        text,
  payload     jsonb,
  expires_at  timestamptz not null default now() + interval '10 minutes',
  created_at  timestamptz not null default now(),
  unique (tenant_id, phone_jid)
);

create index if not exists idx_wa_pending_actions_tenant on wa_pending_actions (tenant_id);

alter table wa_pending_actions enable row level security;
-- Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.
comment on table wa_pending_actions is
  'Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.';

-- ─── wa_rate_limits — throttle inbound / guest provisioning per number ────────
-- A sliding one-window counter keyed by number, consulted before the expensive
-- steps (AI call, Ventera provision) so a flood from one number cannot mint
-- accounts or burn quota. phone_jid is the natural key for the upsert in the RPC.
create table if not exists wa_rate_limits (
  phone_jid    text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

alter table wa_rate_limits enable row level security;
-- Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.
comment on table wa_rate_limits is
  'Service-role only; RLS enabled with no policy so PostgREST denies all non-service access.';

-- Sliding-window limiter, parameterised on max count and window length so each
-- call site (inbound throttle vs provision throttle) can pick its own budget.
-- Modelled on KasKecil's check_whatsapp_rate_limit (20260624180000). Returns true
-- when the message is allowed and records it; false when the limit is exhausted.
-- SECURITY DEFINER with a pinned search_path, and granted to the service role
-- only — nothing else has any business calling it.
create or replace function public.check_wa_rate_limit(
  p_phone  text,
  p_max    int,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count        int;
  v_window_start timestamptz;
begin
  select count, window_start
    into v_count, v_window_start
  from public.wa_rate_limits
  where phone_jid = p_phone;

  -- First message from this number: open a fresh window.
  if not found then
    insert into public.wa_rate_limits (phone_jid, count, window_start)
    values (p_phone, 1, now());
    return true;
  end if;

  -- The previous window has fully elapsed: reset and start counting again.
  if v_window_start < now() - p_window then
    update public.wa_rate_limits
       set count = 1, window_start = now()
     where phone_jid = p_phone;
    return true;
  end if;

  -- Inside the live window and already at the cap: deny.
  if v_count >= p_max then
    return false;
  end if;

  -- Inside the live window and under the cap: count it and allow.
  update public.wa_rate_limits
     set count = count + 1
   where phone_jid = p_phone;
  return true;
end;
$$;

revoke all on function public.check_wa_rate_limit(text, int, interval) from public;
grant execute on function public.check_wa_rate_limit(text, int, interval) to service_role;
