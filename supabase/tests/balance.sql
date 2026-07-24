-- GoStay HMS — balance/payout ("tarik saldo") trigger regression.
-- Run as the superuser AFTER balance_prereq.sql + migrations 030 + 031 + 036 +
-- the tests.* helpers (see run_balance.sh).
--
-- Verifies the money never drifts across the whole lifecycle:
--   income → credited NET of the 7% platform fee
--   payout → funds held atomically, over-withdrawal refused
--   reject → held funds returned
--   refund → credit reversed by the exact amount taken
--   guard  → a payment whose net is already withdrawn cannot be deleted
--   gw ref → a replayed gateway settlement cannot double-credit
--
-- Amounts are whole rupiah so every fee (×0.07) is exact — a rounding drift
-- would surface as a mismatch, not hide in it.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- Fee is the 700 bps (7%) rate set by migration 036.
\set T   '11111111-1111-4111-8111-111111111111'
\set BK1 '22222222-2222-4222-8222-222222222201'
\set BK2 '22222222-2222-4222-8222-222222222202'
\set P1  '33333333-3333-4333-8333-333333333301'
\set P2  '33333333-3333-4333-8333-333333333302'

-- Belt-and-suspenders: assert the rate under test is actually 7% before we lean
-- on it, so a migration regression can't quietly pass the arithmetic below.
select tests.eq('platform fee is 700 bps (7%)',
  (select platform_fee_bps from payment_config where id = true), 700);

insert into tenants (id, name) values (:'T', 'Test Hotel');
insert into bookings (id, tenant_id) values (:'BK1', :'T'), (:'BK2', :'T');

\echo ''
\echo '=== income credits NET of the 7% fee ==='
insert into payments (id, tenant_id, booking_id, amount) values (:'P1', :'T', :'BK1', 1000000);
select tests.eqn('after Rp1,000,000: available',      (select available      from hotel_balance where tenant_id=:'T'), 930000);
select tests.eqn('after Rp1,000,000: lifetime_gross', (select lifetime_gross from hotel_balance where tenant_id=:'T'), 1000000);
select tests.eqn('after Rp1,000,000: lifetime_fee',   (select lifetime_fee   from hotel_balance where tenant_id=:'T'), 70000);
select tests.eqn('after Rp1,000,000: lifetime_net',   (select lifetime_net   from hotel_balance where tenant_id=:'T'), 930000);

insert into payments (id, tenant_id, booking_id, amount) values (:'P2', :'T', :'BK2', 500000);
select tests.eqn('after +Rp500,000: available',      (select available      from hotel_balance where tenant_id=:'T'), 1395000);
select tests.eqn('after +Rp500,000: lifetime_fee',   (select lifetime_fee   from hotel_balance where tenant_id=:'T'), 105000);
select tests.eq ('two reservation_income ledger rows',
  (select count(*) from balance_ledger where tenant_id=:'T' and entry_type='reservation_income'), 2);
-- Invariant: gross = fee + net on every income row (net is derived, not rounded).
select tests.eq ('every income row satisfies gross = fee + net',
  (select count(*) from balance_ledger
     where tenant_id=:'T' and entry_type='reservation_income'
       and gross_amount <> fee_amount + net_amount), 0);

\echo ''
\echo '=== payout holds funds; over-withdrawal is refused ==='
insert into payouts (tenant_id, amount, bank_name, bank_account, account_holder)
  values (:'T', 400000, 'BCA', '123', 'Owner');
select tests.eqn('after Rp400,000 payout: available',           (select available          from hotel_balance where tenant_id=:'T'), 995000);
select tests.eqn('after Rp400,000 payout: lifetime_withdrawn',  (select lifetime_withdrawn from hotel_balance where tenant_id=:'T'), 400000);
select tests.eq ('payout ledger row recorded',
  (select count(*) from balance_ledger where tenant_id=:'T' and entry_type='payout'), 1);

-- The atomic guard: a request larger than `available` must RAISE and move nothing.
select tests.blocked('over-withdraw beyond available balance',
  $$insert into payouts (tenant_id, amount, bank_name, bank_account, account_holder)
      values ('11111111-1111-4111-8111-111111111111', 9000000, 'BCA', '123', 'Owner')$$);
select tests.eqn('available unchanged after refused over-withdraw',
  (select available from hotel_balance where tenant_id=:'T'), 995000);

\echo ''
\echo '=== rejecting a pending payout returns the held funds ==='
update payouts set status='rejected'
  where tenant_id=:'T' and status='pending' and amount=400000;
select tests.eqn('after reject: available restored',          (select available          from hotel_balance where tenant_id=:'T'), 1395000);
select tests.eqn('after reject: lifetime_withdrawn back to 0',(select lifetime_withdrawn from hotel_balance where tenant_id=:'T'), 0);
select tests.eq ('payout_reversal ledger row recorded',
  (select count(*) from balance_ledger where tenant_id=:'T' and entry_type='payout_reversal'), 1);

\echo ''
\echo '=== refunding (deleting) a payment reverses the exact credit ==='
delete from payments where id=:'P2';  -- was Rp500,000 gross → Rp465,000 net
select tests.eqn('after refund: available',      (select available      from hotel_balance where tenant_id=:'T'), 930000);
select tests.eqn('after refund: lifetime_gross', (select lifetime_gross from hotel_balance where tenant_id=:'T'), 1000000);
select tests.eqn('after refund: lifetime_fee',   (select lifetime_fee   from hotel_balance where tenant_id=:'T'), 70000);
select tests.eq ('adjustment (reversal) ledger row recorded',
  (select count(*) from balance_ledger where tenant_id=:'T' and entry_type='adjustment'), 1);

\echo ''
\echo '=== a payment whose net is already withdrawn cannot be deleted ==='
-- Drain the remaining Rp930,000 (P1's net), then try to refund P1: the reversal
-- needs Rp930,000 back but available is 0, so it must RAISE and roll back.
insert into payouts (tenant_id, amount, bank_name, bank_account, account_holder)
  values (:'T', 930000, 'BCA', '123', 'Owner');
select tests.eqn('available drained to 0', (select available from hotel_balance where tenant_id=:'T'), 0);
select tests.blocked('delete a payment whose net was already withdrawn',
  $$delete from payments where id='33333333-3333-4333-8333-333333333301'$$);
select tests.eq ('the withdrawn payment still exists (delete rolled back)',
  (select count(*) from payments where id=:'P1'), 1);

\echo ''
\echo '=== a replayed gateway settlement cannot double-credit (UNIQUE gateway_ref) ==='
\set T2 '11111111-1111-4111-8111-1111111111f2'
insert into tenants (id, name) values (:'T2', 'Idempotency Hotel');
insert into payments (tenant_id, amount, gateway, gateway_ref) values (:'T2', 200000, 'xendit', 'inv-DUP');
select tests.blocked('second payment with the same gateway_ref',
  $$insert into payments (tenant_id, amount, gateway, gateway_ref)
      values ('11111111-1111-4111-8111-1111111111f2', 200000, 'xendit', 'inv-DUP')$$);
select tests.eqn('idempotency hotel credited exactly once (186,000 net)',
  (select available from hotel_balance where tenant_id=:'T2'), 186000);
