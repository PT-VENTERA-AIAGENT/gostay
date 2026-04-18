-- BookMe Hotel Management System — Initial Schema
-- Run this in your Supabase SQL Editor or via `supabase db push`

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";     -- fuzzy phone/name search

-- ─── Enums ───────────────────────────────────────────────────────────────────
create type user_role as enum ('admin', 'staff', 'customer');
create type booking_status as enum (
  'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
);
create type booking_source as enum ('portal', 'phone', 'walk_in', 'staff');
create type payment_status as enum ('pending', 'partial', 'paid', 'refunded');
create type call_direction as enum ('inbound', 'outbound');
create type chat_thread_status as enum ('active', 'resolved');

-- ─── Profiles (extends auth.users) ───────────────────────────────────────────
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text not null default '',
  phone        text,
  role         user_role not null default 'customer',
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    coalesce(
      (new.raw_user_meta_data->>'role')::user_role,
      'customer'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── Room Types ───────────────────────────────────────────────────────────────
create table room_types (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  slug          text not null unique,
  description   text,
  base_rate     numeric(12,2) not null,
  max_occupancy int not null default 2,
  amenities     text[] not null default '{}',
  photos        text[] not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── Individual Rooms ─────────────────────────────────────────────────────────
create table rooms (
  id            uuid primary key default uuid_generate_v4(),
  room_type_id  uuid not null references room_types(id) on delete cascade,
  number        text not null unique,
  floor         int not null default 1,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── Seasonal Pricing ─────────────────────────────────────────────────────────
create table seasonal_pricing (
  id            uuid primary key default uuid_generate_v4(),
  room_type_id  uuid not null references room_types(id) on delete cascade,
  label         text not null,
  start_date    date not null,
  end_date      date not null,
  rate          numeric(12,2) not null,
  created_at    timestamptz not null default now(),
  constraint valid_date_range check (end_date >= start_date)
);

-- ─── Availability Blocks ──────────────────────────────────────────────────────
create table availability_blocks (
  id            uuid primary key default uuid_generate_v4(),
  room_id       uuid not null references rooms(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  reason        text not null default 'maintenance',
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  constraint valid_block_range check (end_date >= start_date)
);

-- ─── Customers ────────────────────────────────────────────────────────────────
create table customers (
  id            uuid primary key default uuid_generate_v4(),
  profile_id    uuid references profiles(id) on delete set null,
  full_name     text not null,
  email         text not null,
  phone         text,
  nationality   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_customers_email on customers(email);
create index idx_customers_phone on customers using gin (phone gin_trgm_ops);
create index idx_customers_name  on customers using gin (full_name gin_trgm_ops);

-- ─── Bookings ─────────────────────────────────────────────────────────────────
create table bookings (
  id                uuid primary key default uuid_generate_v4(),
  reference         text not null unique,
  customer_id       uuid not null references customers(id),
  room_id           uuid not null references rooms(id),
  check_in          date not null,
  check_out         date not null,
  num_adults        int not null default 1,
  num_children      int not null default 0,
  status            booking_status not null default 'pending',
  total_amount      numeric(14,2) not null,
  amount_paid       numeric(14,2) not null default 0,
  payment_status    payment_status not null default 'pending',
  source            booking_source not null default 'portal',
  special_requests  text,
  internal_notes    text,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint valid_stay check (check_out > check_in)
);

-- Prevent double-booking via constraint
create index idx_bookings_room_dates on bookings(room_id, check_in, check_out)
  where status in ('pending', 'confirmed', 'checked_in');

-- Auto-generate reference like BK-20260418-AB3D
create or replace function generate_booking_reference()
returns trigger language plpgsql as $$
begin
  new.reference := 'BK-' ||
    to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substring(md5(random()::text), 1, 4));
  return new;
end;
$$;

create trigger set_booking_reference
  before insert on bookings
  for each row execute procedure generate_booking_reference();

-- ─── Booking Audit Log ────────────────────────────────────────────────────────
create table booking_audit_log (
  id            uuid primary key default uuid_generate_v4(),
  booking_id    uuid not null references bookings(id) on delete cascade,
  action        text not null,
  performed_by  uuid not null references profiles(id),
  note          text,
  created_at    timestamptz not null default now()
);

create index idx_audit_booking on booking_audit_log(booking_id);

-- ─── Chat Threads ─────────────────────────────────────────────────────────────
create table chat_threads (
  id            uuid primary key default uuid_generate_v4(),
  customer_id   uuid not null references customers(id) on delete cascade,
  booking_id    uuid references bookings(id) on delete set null,
  status        chat_thread_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── Chat Messages ────────────────────────────────────────────────────────────
create table chat_messages (
  id              uuid primary key default uuid_generate_v4(),
  thread_id       uuid not null references chat_threads(id) on delete cascade,
  sender_id       uuid not null references profiles(id),
  content         text not null,
  attachment_url  text,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_messages_thread on chat_messages(thread_id, created_at);

-- ─── Call Logs ────────────────────────────────────────────────────────────────
create table call_logs (
  id              uuid primary key default uuid_generate_v4(),
  caller_phone    text not null,
  direction       call_direction not null default 'inbound',
  duration_seconds int,
  summary         text,
  customer_id     uuid references customers(id) on delete set null,
  follow_up       boolean not null default false,
  follow_up_due   date,
  agent_id        uuid not null references profiles(id),
  created_at      timestamptz not null default now()
);

create index idx_call_logs_phone on call_logs using gin (caller_phone gin_trgm_ops);
create index idx_call_logs_follow_up on call_logs(follow_up_due) where follow_up = true;

-- ─── Analytics Cache ──────────────────────────────────────────────────────────
create table analytics_cache (
  id          uuid primary key default uuid_generate_v4(),
  date        date not null,
  metric_key  text not null,
  value       numeric not null,
  updated_at  timestamptz not null default now(),
  constraint analytics_cache_unique unique (date, metric_key)
);

-- ─── Updated-at triggers ──────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on profiles
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on room_types
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on rooms
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on customers
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on bookings
  for each row execute procedure set_updated_at();
create trigger set_updated_at before update on chat_threads
  for each row execute procedure set_updated_at();
