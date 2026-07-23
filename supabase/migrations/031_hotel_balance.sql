-- Hotel balance (saldo), ledger, and payouts (withdrawals).
--
-- The rule: every rupiah a hotel earns from a reservation is credited to its
-- balance NET of Ventera's platform fee (default 5%, from payment_config). The
-- hotel withdraws its available balance via a payout request.
--
-- Where the cut happens: a trigger on `payments` (the one table every settlement
-- flows through — cash at the desk, transfer, QRIS, or an online Xendit webhook).
-- Doing it in the DB means the 5% is applied identically no matter which client
-- created the payment, and the balance can never drift from the payments ledger.
--
--   gross = payments.amount
--   fee   = round(gross * fee_bps / 10000, 2)     -- Ventera's cut (5% => *0.05)
--   net   = gross - fee                            -- credited to the hotel
--   => gross = fee + net always holds (no rounding gap; net is derived, not
--      independently rounded).

-- ─── Per-hotel balance (one row per tenant) ───────────────────────────────────
create table if not exists hotel_balance (
  tenant_id          uuid primary key references tenants(id) on delete cascade,
  available          numeric(14,2) not null default 0 check (available >= 0),
  lifetime_gross     numeric(14,2) not null default 0,   -- total reservation income (before fee)
  lifetime_fee       numeric(14,2) not null default 0,   -- total Ventera fee taken
  lifetime_net       numeric(14,2) not null default 0,   -- total credited to the hotel
  lifetime_withdrawn numeric(14,2) not null default 0,   -- total held for/paid out via payouts
  updated_at         timestamptz not null default now()
);

-- ─── Payout requests (withdrawals) ────────────────────────────────────────────
-- A hotel requests a withdrawal; funds are held (deducted from `available`) the
-- moment the request is created, so the same balance can't be requested twice.
-- Ventera later marks it paid, or rejects it (which returns the held funds).
create table if not exists payouts (
  id             uuid primary key default uuid_generate_v4(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  amount         numeric(14,2) not null check (amount > 0),
  status         text not null default 'pending' check (status in ('pending','paid','rejected')),
  bank_name      text,
  bank_account   text,
  account_holder text,
  note           text,
  requested_by   uuid references profiles(id),
  processed_by   uuid references profiles(id),
  processed_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_payouts_tenant on payouts(tenant_id, created_at desc);

-- ─── Append-only ledger (every movement of the balance) ───────────────────────
create table if not exists balance_ledger (
  id           bigserial primary key,
  tenant_id    uuid not null references tenants(id) on delete cascade,
  entry_type   text not null check (entry_type in
                 ('reservation_income','payout','payout_reversal','adjustment')),
  booking_id   uuid references bookings(id) on delete set null,
  payment_id   uuid references payments(id) on delete set null,
  payout_id    uuid references payouts(id)  on delete set null,
  gross_amount numeric(14,2) not null default 0,  -- income only: the full payment
  fee_amount   numeric(14,2) not null default 0,  -- income only: Ventera's cut
  net_amount   numeric(14,2) not null,            -- signed effect on `available` (+income, -payout)
  fee_bps      int,
  description  text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_balance_ledger_tenant on balance_ledger(tenant_id, created_at desc);

-- ─── Credit the hotel's balance on every payment, net of the platform fee ─────
create or replace function credit_hotel_balance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  bps   int;
  gross numeric(14,2);
  fee   numeric(14,2);
  net   numeric(14,2);
begin
  select platform_fee_bps into bps from payment_config where id = true;
  bps   := coalesce(bps, 500);
  gross := new.amount;
  fee   := round(gross * bps / 10000.0, 2);
  net   := gross - fee;

  insert into hotel_balance (tenant_id, available, lifetime_gross, lifetime_fee, lifetime_net, updated_at)
  values (new.tenant_id, net, gross, fee, net, now())
  on conflict (tenant_id) do update set
    available      = hotel_balance.available      + excluded.available,
    lifetime_gross = hotel_balance.lifetime_gross + excluded.lifetime_gross,
    lifetime_fee   = hotel_balance.lifetime_fee   + excluded.lifetime_fee,
    lifetime_net   = hotel_balance.lifetime_net   + excluded.lifetime_net,
    updated_at     = now();

  insert into balance_ledger
    (tenant_id, entry_type, booking_id, payment_id, gross_amount, fee_amount, net_amount, fee_bps, description)
  values
    (new.tenant_id, 'reservation_income', new.booking_id, new.id, gross, fee, net, bps,
     'Pendapatan reservasi (potong fee ' || trim_scale((bps / 100.0)::numeric) || '%)');

  return null;
end $$;

drop trigger if exists trg_credit_hotel_balance on payments;
create trigger trg_credit_hotel_balance
  after insert on payments
  for each row execute function credit_hotel_balance();

-- ─── Reverse the credit when a payment is deleted/refunded ─────────────────────
-- Runs BEFORE delete on purpose: balance_ledger.payment_id is ON DELETE SET NULL,
-- so by an AFTER-delete trigger the original credit row would already be
-- unlinked. Here we can still find it and reverse the EXACT amounts that were
-- credited (correct even if the fee rate changed since), not a recomputation.
--
-- Guard: a payment whose net was already withdrawn cannot be deleted — the
-- conditional UPDATE won't match and we raise, rolling the delete back. (Refunds
-- of already-withdrawn money are an operational decision, not a silent negative
-- balance.)
create or replace function reverse_hotel_balance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  led     record;
  updated int;
begin
  select gross_amount, fee_amount, net_amount into led
    from balance_ledger
   where payment_id = old.id and entry_type = 'reservation_income'
   order by id
   limit 1;

  if not found then
    return old;  -- never credited (e.g. pre-dates the balance system) → nothing to reverse
  end if;

  update hotel_balance
     set available      = available      - led.net_amount,
         lifetime_gross = lifetime_gross - led.gross_amount,
         lifetime_fee   = lifetime_fee   - led.fee_amount,
         lifetime_net   = lifetime_net   - led.net_amount,
         updated_at     = now()
   where tenant_id = old.tenant_id
     and available >= led.net_amount;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'Tidak bisa menghapus pembayaran: dana % sudah ditarik (saldo tidak cukup untuk dibalik)', led.net_amount
      using errcode = 'check_violation';
  end if;

  insert into balance_ledger
    (tenant_id, entry_type, booking_id, payment_id, gross_amount, fee_amount, net_amount, fee_bps, description)
  values
    (old.tenant_id, 'adjustment', old.booking_id, old.id,
     -led.gross_amount, -led.fee_amount, -led.net_amount, null,
     'Pembalikan pembayaran (refund/hapus)');

  return old;
end $$;

drop trigger if exists trg_reverse_hotel_balance on payments;
create trigger trg_reverse_hotel_balance
  before delete on payments
  for each row execute function reverse_hotel_balance();

-- ─── Hold funds when a payout is requested ────────────────────────────────────
-- Atomic guard: the conditional UPDATE only succeeds when the balance actually
-- covers the amount, so two concurrent requests can't both drain it.
create or replace function apply_payout() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare updated int;
begin
  update hotel_balance
     set available          = available - new.amount,
         lifetime_withdrawn = lifetime_withdrawn + new.amount,
         updated_at         = now()
   where tenant_id = new.tenant_id
     and available >= new.amount;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'Saldo tidak cukup untuk penarikan sebesar %', new.amount
      using errcode = 'check_violation';
  end if;

  insert into balance_ledger
    (tenant_id, entry_type, payout_id, net_amount, description)
  values
    (new.tenant_id, 'payout', new.id, -new.amount, 'Penarikan saldo (diminta)');

  return null;
end $$;

drop trigger if exists trg_apply_payout on payouts;
create trigger trg_apply_payout
  after insert on payouts
  for each row execute function apply_payout();

-- ─── Return held funds if a payout is rejected ────────────────────────────────
create or replace function reverse_payout() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status = 'pending' and new.status = 'rejected' then
    update hotel_balance
       set available          = available + old.amount,
           lifetime_withdrawn = lifetime_withdrawn - old.amount,
           updated_at         = now()
     where tenant_id = old.tenant_id;

    insert into balance_ledger
      (tenant_id, entry_type, payout_id, net_amount, description)
    values
      (old.tenant_id, 'payout_reversal', old.id, old.amount, 'Penarikan ditolak — dana dikembalikan');
  end if;
  return new;
end $$;

drop trigger if exists trg_reverse_payout on payouts;
create trigger trg_reverse_payout
  after update on payouts
  for each row execute function reverse_payout();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Balance + ledger are read-only to clients: staff see their own hotel, admin
-- (Ventera) sees all. They are written ONLY by the SECURITY DEFINER triggers
-- above (which run as owner and bypass RLS), so there is no client write policy.
alter table hotel_balance enable row level security;
drop policy if exists hotel_balance_read on hotel_balance;
create policy hotel_balance_read on hotel_balance
  for select to authenticated
  using (get_my_role() = 'admin'::user_role
         or (get_my_role() = 'staff'::user_role and tenant_id = get_my_tenant()));

alter table balance_ledger enable row level security;
drop policy if exists balance_ledger_read on balance_ledger;
create policy balance_ledger_read on balance_ledger
  for select to authenticated
  using (get_my_role() = 'admin'::user_role
         or (get_my_role() = 'staff'::user_role and tenant_id = get_my_tenant()));

-- Payouts: staff of a hotel may see and REQUEST (insert) their own; only admin
-- may update status (mark paid / reject). tenant_id is auto-stamped on insert.
alter table payouts enable row level security;
drop policy if exists payouts_read on payouts;
create policy payouts_read on payouts
  for select to authenticated
  using (get_my_role() = 'admin'::user_role
         or (get_my_role() = 'staff'::user_role and tenant_id = get_my_tenant()));

drop policy if exists payouts_request on payouts;
create policy payouts_request on payouts
  for insert to authenticated
  with check (get_my_role() = 'admin'::user_role
              or (get_my_role() = 'staff'::user_role and tenant_id = get_my_tenant()));

drop policy if exists payouts_process on payouts;
create policy payouts_process on payouts
  for update to authenticated
  using (get_my_role() = 'admin'::user_role)
  with check (get_my_role() = 'admin'::user_role);

drop trigger if exists trg_set_tenant_id on payouts;
create trigger trg_set_tenant_id before insert on payouts
  for each row execute function set_tenant_id();
