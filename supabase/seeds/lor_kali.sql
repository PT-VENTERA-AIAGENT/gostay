-- Seed data for the "Lor Kali" test hotel.
--
-- Scoped to ONE tenant by a single constant below. Nothing here touches another
-- hotel's rows, and every statement is idempotent — re-running adds nothing and
-- overwrites nothing, so it is safe to apply repeatedly while testing.
--
-- Deliberately NOT a migration: migrations describe schema every deployment must
-- have, while this is sample content for one hotel on one database. It lives in
-- supabase/seeds/ so `supabase db push` never picks it up.
--
-- Run:  psql "$SETUP_DB_CONNECTION_STRING" -v ON_ERROR_STOP=1 -f supabase/seeds/lor_kali.sql

\set ON_ERROR_STOP on

begin;

-- The one tenant everything below is filed under. Every insert repeats it
-- explicitly rather than relying on set_tenant_id(), because this runs as the
-- database owner — there is no auth.uid() for the trigger to resolve a tenant
-- from, so an omitted tenant_id would land as NULL and fail.
create temporary table _seed (tenant uuid) on commit drop;
insert into _seed values ('0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e');

do $$
declare t uuid;
begin
  select tenant into t from _seed;
  if not exists (select 1 from tenants where id = t) then
    raise exception 'tenant % not found — refusing to seed', t;
  end if;
end $$;

-- ─── 1. Room types ────────────────────────────────────────────────────────────
-- "Reguler" already exists on this hotel; ON CONFLICT leaves whatever the owner
-- has already set (they may have changed the rate) and only adds what is missing.
insert into room_types (tenant_id, name, slug, description, base_rate, max_occupancy, is_active)
select s.tenant, v.name, v.slug, v.description, v.base_rate, v.max_occupancy, true
from _seed s,
  (values
    ('Reguler', 'reguler', 'Kamar standar dengan kipas angin, kamar mandi dalam.', 120000, 2),
    ('Deluxe',  'deluxe',  'Kamar ber-AC menghadap taman, termasuk sarapan.',      185000, 2),
    ('Family',  'family',  'Kamar luas dua ranjang, cocok untuk keluarga kecil.',  250000, 4)
  ) as v(name, slug, description, base_rate, max_occupancy)
on conflict (tenant_id, slug) do nothing;

-- ─── 2. Rooms ─────────────────────────────────────────────────────────────────
-- Housekeeping statuses are varied on purpose so the room board shows more than
-- one colour the moment it is opened.
-- The VALUES list is joined BEFORE room_types, because the join condition reads
-- v.slug — an alias is only visible to joins that come after it.
insert into rooms (tenant_id, room_type_id, number, floor, housekeeping_status, is_active)
select s.tenant, rt.id, v.number, v.floor, v.hk::housekeeping_status, true
from _seed s
cross join (values
    ('101', 1, 'reguler', 'clean'),
    ('102', 1, 'reguler', 'dirty'),
    ('103', 1, 'reguler', 'clean'),
    ('201', 2, 'deluxe',  'clean'),
    ('202', 2, 'deluxe',  'inspected'),
    ('203', 2, 'deluxe',  'maintenance'),
    ('301', 3, 'family',  'clean')
  ) as v(number, floor, slug, hk)
join room_types rt on rt.tenant_id = s.tenant and rt.slug = v.slug
on conflict (tenant_id, number) do nothing;

-- ─── 3. POS menu ──────────────────────────────────────────────────────────────
-- This is what the WhatsApp room-service flow reads: without active pos_products
-- the "menu" flow correctly answers "menu belum tersedia", which looks like a bug
-- when you are actually just testing an empty hotel.
insert into pos_products (tenant_id, name, category, price, is_active)
select s.tenant, v.name, v.category, v.price, true
from _seed s,
  (values
    ('Nasi Goreng Kampung', 'Makanan', 25000),
    ('Mie Goreng Jawa',     'Makanan', 23000),
    ('Ayam Bakar Madu',     'Makanan', 35000),
    ('Gado-Gado',           'Makanan', 20000),
    ('Pisang Goreng',       'Makanan', 15000),
    ('Kopi Tubruk',         'Minuman', 10000),
    ('Teh Manis Hangat',    'Minuman',  8000),
    ('Es Jeruk Peras',      'Minuman', 12000),
    ('Air Mineral 600ml',   'Minuman',  5000),
    ('Laundry per kg',      'Layanan', 15000),
    ('Extra Bed',           'Layanan', 75000)
  ) as v(name, category, price)
where not exists (
  select 1 from pos_products p where p.tenant_id = s.tenant and p.name = v.name
);

-- ─── 4. Guests ────────────────────────────────────────────────────────────────
-- Phone numbers are in the 62… form the WhatsApp side stores, so a seeded guest
-- and a real WhatsApp guest look the same to every query.
insert into customers (tenant_id, full_name, phone, email, nationality)
select s.tenant, v.full_name, v.phone, v.email, 'ID'
from _seed s,
  (values
    ('Budi Santoso',   '628111000001', 'budi.test@example.com'),
    ('Siti Rahayu',    '628111000002', 'siti.test@example.com'),
    ('Agus Prasetyo',  '628111000003', 'agus.test@example.com'),
    ('Dewi Lestari',   '628111000004', 'dewi.test@example.com')
  ) as v(full_name, phone, email)
where not exists (
  select 1 from customers c where c.tenant_id = s.tenant and c.phone = v.phone
);

-- ─── 5. Bookings ──────────────────────────────────────────────────────────────
-- Dates are relative to CURRENT_DATE so the fixture stays meaningful whenever it
-- is run — a hard-coded "checked_in" stay would silently become a past booking.
--
-- total_amount is computed as rate × nights rather than typed in. The
-- enforce_portal_booking_price trigger checks exactly that for unprivileged
-- callers, and matching it keeps the seed valid regardless of who runs it.
--
-- `reference` is omitted: the set_booking_reference trigger fills it (BK-…),
-- which is what real bookings carry.
insert into bookings (
  tenant_id, customer_id, room_id, check_in, check_out,
  num_adults, num_children, status, total_amount, amount_paid,
  payment_status, source, special_requests
)
select
  s.tenant, c.id, r.id, v.check_in, v.check_out,
  v.adults, v.children, v.status::booking_status,
  rt.base_rate * (v.check_out - v.check_in),
  case v.paid when 'full' then rt.base_rate * (v.check_out - v.check_in) else 0 end,
  v.pay::payment_status, v.src::booking_source, v.note
from _seed s
cross join (values
    -- Currently staying. This is the row that makes the in-house WhatsApp tests
    -- possible: room service is gated on a checked_in booking.
    ('628111000001', '201', current_date - 1, current_date + 2, 2, 0,
     'checked_in',  'paid',    'full', 'walk_in', 'Minta kamar yang tenang.'),
    -- Arriving next week.
    ('628111000002', '301', current_date + 8, current_date + 10, 2, 2,
     'confirmed',   'pending', 'none', 'portal',  'Bawa anak kecil, minta extra bed.'),
    -- Already left — gives the analytics and folio screens some history.
    ('628111000003', '101', current_date - 8, current_date - 6, 1, 0,
     'checked_out', 'paid',    'full', 'phone',   null),
    -- Awaiting confirmation, so the bookings list has something actionable.
    ('628111000004', '102', current_date + 18, current_date + 19, 2, 0,
     'pending',     'pending', 'none', 'portal',  null)
  ) as v(phone, room, check_in, check_out, adults, children, status, pay, paid, src, note)
join customers c   on c.tenant_id = s.tenant and c.phone = v.phone
join rooms r       on r.tenant_id = s.tenant and r.number = v.room
join room_types rt on rt.id = r.room_type_id
where not exists (
  select 1 from bookings b
  where b.tenant_id = s.tenant and b.customer_id = c.id and b.check_in = v.check_in
);

-- ─── 6. Guest requests ────────────────────────────────────────────────────────
-- Attached to the in-house stay, so the "Permintaan Tamu" queue is not empty on
-- first open and the staff side can be exercised without WhatsApp.
insert into guest_requests (
  tenant_id, booking_id, room_id, customer_id, title, description, status, priority
)
select s.tenant, b.id, b.room_id, b.customer_id, v.title, v.description,
       v.status::request_status, v.priority::request_priority
from _seed s
cross join (values
    ('Handuk tambahan', 'Mohon dikirim 2 handuk bersih ke kamar.', 'open', 'normal'),
    ('AC kurang dingin', 'AC terasa kurang dingin sejak semalam.',  'in_progress', 'high')
  ) as v(title, description, status, priority)
join customers c on c.tenant_id = s.tenant and c.phone = '628111000001'
join bookings b  on b.tenant_id = s.tenant and b.customer_id = c.id and b.status = 'checked_in'
where not exists (
  select 1 from guest_requests g where g.tenant_id = s.tenant and g.title = v.title
);

-- ─── 7. Online payment, in TEST mode ──────────────────────────────────────────
-- Switches on the in-chat payment path for this hotel only. `mode = 'test'` means
-- the invoice link is a real, clickable Xendit page that moves no money — which
-- is what a test hotel wants, and what the WhatsApp reply labels as "mode uji
-- coba" so a sandbox payment is never mistaken for a settled bill.
insert into hotel_payment_config (tenant_id, mode, is_active, updated_by)
select s.tenant, 'test', true, 'seed:lor_kali' from _seed s
on conflict (tenant_id) do nothing;

commit;

-- ─── Summary ──────────────────────────────────────────────────────────────────
\echo ''
\echo 'Lor Kali seeded:'
select 'room_types' as tabel, count(*) from room_types where tenant_id='0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'
union all select 'rooms',        count(*) from rooms         where tenant_id='0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'
union all select 'pos_products', count(*) from pos_products  where tenant_id='0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'
union all select 'customers',    count(*) from customers     where tenant_id='0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'
union all select 'bookings',     count(*) from bookings      where tenant_id='0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'
union all select 'guest_requests', count(*) from guest_requests where tenant_id='0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'
union all select 'wa_flows',     count(*) from wa_flows      where tenant_id='0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e'
order by 1;
