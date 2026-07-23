-- Payment gateway (Xendit) gating + platform-fee config.
--
-- Design (see docs/PRD-payment-gateway.md):
--   • One global toggle picks live/test mode. Xendit keys themselves live ONLY in
--     server env (never in DB), read by api/_lib/payment/*. This table holds the
--     switch, not the secrets.
--   • One global platform-fee rate (basis points). Ventera's cut on every hotel's
--     reservation income. 500 bps = 5%. Kept here so it is auditable and tunable
--     without a redeploy, and read by the balance-credit trigger in 031.
--   • payments gains gateway columns so an online (Xendit) settlement is traceable
--     to its invoice and its live/test environment, and so the webhook is
--     idempotent (a paid invoice can only ever create one payment row).

-- ─── Single-row payment config (mode + platform fee) ──────────────────────────
-- The `id boolean primary key check (id)` trick pins the table to exactly one
-- row (id can only ever be true), so "the config" is unambiguous.
create table if not exists payment_config (
  id                boolean primary key default true check (id),
  mode              text not null default 'test' check (mode in ('live','test')),
  platform_fee_bps  int  not null default 500 check (platform_fee_bps between 0 and 10000),
  updated_by        text,
  updated_at        timestamptz not null default now()
);
insert into payment_config (id, mode) values (true, 'test')
  on conflict (id) do nothing;

-- Audit every mode/fee change.
create table if not exists payment_mode_audit (
  id         bigserial primary key,
  old_mode   text,
  new_mode   text,
  old_fee_bps int,
  new_fee_bps int,
  changed_by text,
  changed_at timestamptz not null default now()
);

-- Log the change + bump updated_at on any toggle.
create or replace function log_payment_config() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.mode is distinct from old.mode
     or new.platform_fee_bps is distinct from old.platform_fee_bps then
    insert into payment_mode_audit(old_mode, new_mode, old_fee_bps, new_fee_bps, changed_by)
    values (old.mode, new.mode, old.platform_fee_bps, new.platform_fee_bps, new.updated_by);
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_payment_config on payment_config;
create trigger trg_payment_config
  before update on payment_config
  for each row execute function log_payment_config();

-- ─── Gateway columns on payments ──────────────────────────────────────────────
-- gateway     : which processor settled this ('xendit'), null for cash/manual.
-- gateway_ref : the processor's invoice/charge id. UNIQUE so a replayed webhook
--               cannot double-credit a hotel (idempotency key).
-- payment_env : 'live' | 'test' — which key set produced it, so reports can split
--               real money from sandbox.
alter table payments add column if not exists gateway     text;
alter table payments add column if not exists gateway_ref text;
alter table payments add column if not exists payment_env text;

create unique index if not exists uq_payments_gateway_ref
  on payments(gateway_ref) where gateway_ref is not null;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Config is platform-level and not secret (it holds a mode + a fee %, never a
-- key), so any signed-in user may READ it (the Saldo page shows the fee, the
-- admin panel shows the mode). Writes happen ONLY via the service role (the
-- toggle endpoint) — there is deliberately no INSERT/UPDATE/DELETE policy, so
-- authenticated clients cannot change the fee or flip to live.
alter table payment_config enable row level security;
drop policy if exists payment_config_read on payment_config;
create policy payment_config_read on payment_config
  for select to authenticated using (true);

alter table payment_mode_audit enable row level security;
drop policy if exists payment_mode_audit_read on payment_mode_audit;
create policy payment_mode_audit_read on payment_mode_audit
  for select to authenticated
  using (get_my_role() = 'admin'::user_role);
