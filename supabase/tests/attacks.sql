-- GoStay HMS — RLS regression test, part 3 of 3: the attacks.
-- Run as `authenticator`, NOT the superuser (see setup.sql for why).
--
-- Every one of the "must be denied" cases below succeeded against 001-004.
-- They are the reason 005_tighten_rls.sql exists; this file is what stops them
-- coming back.

\set ON_ERROR_STOP on

\echo ''
\echo '=== CUSTOMER (Mallory, signed in) ==='
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', false);

select tests.blocked('self-promote to admin',
  $$update profiles set role='admin' where id='cccccccc-0000-0000-0000-000000000003'$$);
select tests.blocked('deactivate self',
  $$update profiles set is_active=false where id='cccccccc-0000-0000-0000-000000000003'$$);
select tests.blocked('re-point own sso_sub to steal an identity',
  $$update profiles set sso_sub='sso|admin' where id='cccccccc-0000-0000-0000-000000000003'$$);
select tests.blocked('promote another user',
  $$update profiles set role='admin' where id='dddddddd-0000-0000-0000-000000000004'$$);
select tests.blocked('rewrite own booking price',
  $$update bookings set total_amount=1 where id='44444444-0000-0000-0000-000000000001'$$);
select tests.blocked('mark own booking paid',
  $$update bookings set payment_status='paid' where id='44444444-0000-0000-0000-000000000001'$$);
select tests.blocked('edit a stranger''s booking',
  $$update bookings set total_amount=1 where id='44444444-0000-0000-0000-000000000002'$$);
select tests.blocked('book a free stay',
  $$insert into bookings (customer_id, room_id, check_in, check_out, status, total_amount, payment_status)
    values ('33333333-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001',
            '2026-10-01','2026-10-03','pending',1,'pending')$$);
select tests.blocked('self-confirm a booking on insert',
  $$insert into bookings (customer_id, room_id, check_in, check_out, status, total_amount, payment_status)
    values ('33333333-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001',
            '2026-11-01','2026-11-03','confirmed',2000000,'paid')$$);
select tests.blocked('inject into a stranger''s chat thread',
  $$insert into chat_messages (thread_id, sender_id, content)
    values ('55555555-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','pwned')$$);
select tests.blocked('forge sender_id as the admin',
  $$insert into chat_messages (thread_id, sender_id, content)
    values ('55555555-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','pwned')$$);
select tests.blocked('forge an audit row as the admin',
  $$insert into booking_audit_log (booking_id, action, performed_by)
    values ('44444444-0000-0000-0000-000000000001','confirmed','aaaaaaaa-0000-0000-0000-000000000001')$$);

select tests.eq('rows of other customers'' bookings visible',
  (select count(*) from bookings where customer_id='33333333-0000-0000-0000-000000000002'), 0);
select tests.eq('analytics rows visible to a customer', (select count(*) from analytics_cache), 0);
select tests.eq('other profiles visible to a customer',
  (select count(*) from profiles where id <> 'cccccccc-0000-0000-0000-000000000003'), 0);

select tests.allowed('cancel own booking',
  $$update bookings set status='cancelled' where id='44444444-0000-0000-0000-000000000001'$$);
select tests.allowed('update own name',
  $$update profiles set full_name='Mallory Renamed' where id='cccccccc-0000-0000-0000-000000000003'$$);

\echo ''
\echo '=== ANON (not signed in) ==='
reset role; set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select tests.eq('analytics rows visible to anon', (select count(*) from analytics_cache), 0);
select tests.eq('bookings visible to anon', (select count(*) from bookings), 0);
select tests.eq('profiles visible to anon', (select count(*) from profiles), 0);
select tests.blocked('overwrite the revenue figure',
  $$update analytics_cache set value=0 where metric_key='revenue_total'$$);
select tests.blocked('insert analytics',
  $$insert into analytics_cache (date, metric_key, value) values ('2026-07-02','fake',1)$$);
select tests.blocked('create a customer record',
  $$insert into customers (full_name, email) values ('x','x@x.com')$$);
select tests.blocked('forge an audit row',
  $$insert into booking_audit_log (booking_id, action, performed_by)
    values ('44444444-0000-0000-0000-000000000001','cancelled','aaaaaaaa-0000-0000-0000-000000000001')$$);

\echo ''
\echo '=== STAFF ==='
reset role; set role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', false);
select tests.blocked('staff promotes themselves to admin',
  $$update profiles set role='admin' where id='bbbbbbbb-0000-0000-0000-000000000002'$$);
select tests.eq('analytics rows visible to staff', (select count(*) from analytics_cache), 1);
select tests.allowed('staff confirms a booking',
  $$update bookings set status='confirmed' where id='44444444-0000-0000-0000-000000000002'$$);

\echo ''
\echo '=== ADMIN ==='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', false);
select tests.allowed('admin promotes a customer to staff',
  $$update profiles set role='staff' where id='dddddddd-0000-0000-0000-000000000004'$$);
select tests.allowed('admin deactivates a user',
  $$update profiles set is_active=false where id='dddddddd-0000-0000-0000-000000000004'$$);

\echo ''
\echo '=== DEACTIVATED USER (004 + 005) ==='
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}', false);
select tests.eq('analytics rows visible to a deactivated ex-staff',
  (select count(*) from analytics_cache), 0);
select tests.blocked('deactivated user reactivates themselves',
  $$update profiles set is_active=true where id='dddddddd-0000-0000-0000-000000000004'$$);
