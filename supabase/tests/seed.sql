-- GoStay HMS — RLS regression test, part 2 of 3: seed. Run as the superuser,
-- which bypasses RLS — the same position api/_lib/provision.ts occupies with
-- the service_role key.

-- Fixed uuids so the attack script can reference them literally.
insert into profiles (id, email, full_name, role, sso_sub) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@ventera.ai',    'The Admin',    'admin',    'sso|admin'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'staff@ventera.ai',    'The Staff',    'staff',    'sso|staff'),
  ('cccccccc-0000-0000-0000-000000000003', 'mallory@example.com', 'Mallory',      'customer', 'sso|mallory'),
  ('dddddddd-0000-0000-0000-000000000004', 'victim@example.com',  'Victim',       'customer', 'sso|victim');

insert into room_types (id, name, slug, base_rate, max_occupancy) values
  ('11111111-0000-0000-0000-000000000001', 'Deluxe', 'deluxe', 1000000, 2);

insert into rooms (id, room_type_id, number, floor) values
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '101', 1);

insert into customers (id, profile_id, full_name, email) values
  ('33333333-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'Mallory', 'mallory@example.com'),
  ('33333333-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004', 'Victim',  'victim@example.com');

insert into bookings (id, customer_id, room_id, check_in, check_out, status, total_amount, payment_status)
values
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-000000000001', '2026-08-01', '2026-08-03', 'confirmed', 2000000, 'pending'),
  ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002',
   '22222222-0000-0000-0000-000000000001', '2026-09-01', '2026-09-03', 'confirmed', 2000000, 'pending');

insert into chat_threads (id, customer_id) values
  ('55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002');

insert into analytics_cache (date, metric_key, value) values
  ('2026-07-01', 'revenue_total', 987654321);
