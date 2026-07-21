-- Front-desk services: payments, POS/folio charges, guest requests, housekeeping.
-- Same tenancy model as the rest of the app: every row carries tenant_id, RLS is
-- tenant-scoped for staff and platform-wide for admin (Ventera), service-role
-- bypasses. New tables mirror 011/018.

-- ─── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type payment_method as enum ('cash','transfer','card','qris','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type request_status as enum ('open','in_progress','done','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type request_priority as enum ('low','normal','high');
exception when duplicate_object then null; end $$;
do $$ begin
  create type housekeeping_status as enum ('clean','dirty','cleaning','inspected','maintenance');
exception when duplicate_object then null; end $$;

-- ─── Payments (settle a booking's balance) ────────────────────────────────────
create table if not exists payments (
  id         uuid primary key default uuid_generate_v4(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  method     payment_method not null default 'cash',
  note       text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_booking on payments(booking_id);

-- ─── POS charges (folio line items beyond the room) ───────────────────────────
create table if not exists pos_charges (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  booking_id  uuid not null references bookings(id) on delete cascade,
  description text not null,
  category    text not null default 'other',   -- fnb | minibar | laundry | spa | other
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  quantity    int not null default 1 check (quantity > 0),
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_pos_charges_booking on pos_charges(booking_id);

-- ─── Guest requests / service log ─────────────────────────────────────────────
create table if not exists guest_requests (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  booking_id  uuid references bookings(id) on delete set null,
  room_id     uuid references rooms(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  title       text not null,
  description text,
  status      request_status not null default 'open',
  priority    request_priority not null default 'normal',
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_guest_requests_tenant on guest_requests(tenant_id, status);

-- ─── Housekeeping status on rooms ─────────────────────────────────────────────
alter table rooms add column if not exists housekeeping_status housekeeping_status not null default 'clean';

-- ─── Keep the booking's paid amount + status in sync with its payments ─────────
create or replace function recompute_booking_payment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare bid uuid; total numeric; paid numeric;
begin
  bid := coalesce(new.booking_id, old.booking_id);
  select total_amount into total from bookings where id = bid;
  select coalesce(sum(amount), 0) into paid from payments where booking_id = bid;
  update bookings set
    amount_paid = paid,
    payment_status = case
      when paid <= 0 then 'pending'::payment_status
      when paid < coalesce(total, 0) then 'partial'::payment_status
      else 'paid'::payment_status end,
    updated_at = now()
  where id = bid;
  return null;
end $$;

drop trigger if exists trg_recompute_payment on payments;
create trigger trg_recompute_payment
  after insert or update or delete on payments
  for each row execute function recompute_booking_payment();

-- updated_at bump on guest_requests
drop trigger if exists set_updated_at_guest_requests on guest_requests;
create trigger set_updated_at_guest_requests before update on guest_requests
  for each row execute function set_updated_at();

-- ─── RLS: staff manage their own hotel, admin (Ventera) platform-wide ──────────
do $$
declare t text;
begin
  foreach t in array array['payments','pos_charges','guest_requests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_access', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      || 'using (get_my_role() = ''admin''::user_role '
      || 'or (get_my_role() = ''staff''::user_role and tenant_id = get_my_tenant())) '
      || 'with check (get_my_role() = ''admin''::user_role '
      || 'or (get_my_role() = ''staff''::user_role and tenant_id = get_my_tenant()))',
      t || '_access', t);
  end loop;
end $$;

-- Auto-stamp tenant_id from the caller's profile on client (authenticated) inserts.
do $$
declare t text;
begin
  foreach t in array array['payments','pos_charges','guest_requests'] loop
    execute format('drop trigger if exists trg_set_tenant_id on %I', t);
    execute format('create trigger trg_set_tenant_id before insert on %I for each row execute function set_tenant_id()', t);
  end loop;
end $$;
