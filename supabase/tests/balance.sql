-- GoStay HMS — balance/payout ("tarik saldo") trigger regression.
-- Run as the superuser AFTER balance_prereq.sql + migrations 030 + 031 + 032 +
-- 036 + 055 + the tests.* helpers (see run_balance.sh).
--
-- Verifies the money never drifts across the whole lifecycle:
--   income → credited NET of the 7% platform fee
--   payout → funds held atomically, over-withdrawal refused
--   reject → held funds returned
--   refund → credit reversed by the exact amount taken
--   guard  → a payment whose net is already withdrawn cannot be deleted
--   gw ref → a replayed gateway settlement cannot double-credit
--   sewa   → a subscription hotel (055) is credited WHOLE, and switching models
--            changes only what happens next, never what already happened
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Model tagihan langganan (migration 055)
-- ─────────────────────────────────────────────────────────────────────────────
\set T3 '11111111-1111-4111-8111-111111111133'
\set P3 '33333333-3333-4333-8333-333333333303'
\set P4 '33333333-3333-4333-8333-333333333304'

\echo ''
\echo '=== hotel langganan: pendapatan masuk UTUH (0% potongan) ==='
insert into tenants (id, name) values (:'T3', 'Hotel Langganan');
insert into hotel_payment_config (tenant_id, billing_mode, subscription_amount, updated_by)
  values (:'T3', 'subscription', 500000, 'test');
insert into payments (id, tenant_id, amount) values (:'P3', :'T3', 1000000);
select tests.eqn('langganan: available = bruto penuh', (select available    from hotel_balance where tenant_id=:'T3'), 1000000);
select tests.eqn('langganan: lifetime_fee tetap 0',    (select lifetime_fee from hotel_balance where tenant_id=:'T3'), 0);
select tests.eq ('langganan: fee_bps ledger = 0',
  (select fee_bps from balance_ledger where payment_id=:'P3' and entry_type='reservation_income'), 0);
select tests.eq ('langganan: ledger menerangkan sebabnya',
  (select count(*) from balance_ledger where payment_id=:'P3' and description like '%langganan%'), 1);

\echo ''
\echo '=== pindah kembali ke komisi: hanya pembayaran BERIKUTNYA yang dipotong ==='
update hotel_payment_config set billing_mode='commission', updated_by='test' where tenant_id=:'T3';
insert into payments (id, tenant_id, amount) values (:'P4', :'T3', 1000000);
select tests.eqn('setelah pindah: available 1.000.000 + 930.000', (select available    from hotel_balance where tenant_id=:'T3'), 1930000);
select tests.eqn('setelah pindah: lifetime_fee = 70.000',         (select lifetime_fee from hotel_balance where tenant_id=:'T3'), 70000);
select tests.eq ('perpindahan model tercatat di audit',
  (select count(*) from hotel_payment_mode_audit
     where tenant_id=:'T3' and old_billing='subscription' and new_billing='commission'), 1);

-- Konsol menulis lewat upsert. Pada `on conflict do update`, trigger BEFORE
-- INSERT tetap jalan untuk baris usulan sebelum bentrokannya diketahui — dulu
-- itu membuat tiap sentuhan menulis baris audit hantu "hotel baru disetel".
-- Setelah pindah ke trigger AFTER, satu perubahan = tepat satu baris audit.
insert into hotel_payment_config (tenant_id, billing_mode, subscription_amount, updated_by)
  values (:'T3', 'subscription', 750000, 'upsert-test')
  on conflict (tenant_id) do update
    set billing_mode = excluded.billing_mode,
        subscription_amount = excluded.subscription_amount,
        updated_by = excluded.updated_by;
select tests.eq ('upsert pada baris yang sudah ada = satu baris audit, tanpa baris hantu',
  (select count(*) from hotel_payment_mode_audit where tenant_id=:'T3' and changed_by='upsert-test'), 1);
select tests.eq ('baris audit itu mencatat model SEBELUMNYA, bukan kosong',
  (select count(*) from hotel_payment_mode_audit
     where tenant_id=:'T3' and changed_by='upsert-test' and old_billing='commission'), 1);
-- Kembalikan ke komisi supaya pemeriksaan refund di bawah tetap bicara soal
-- tarif tercatat, bukan tarif yang kebetulan berubah di sini.
update hotel_payment_config set billing_mode='commission', updated_by='test' where tenant_id=:'T3';

\echo ''
\echo '=== refund memakai tarif yang TERCATAT, bukan tarif yang berlaku sekarang ==='
-- P3 dibayar saat hotel masih langganan (fee 0). Meski hotelnya kini komisi,
-- pembalikannya harus mengembalikan 1.000.000 penuh — bukan 930.000.
delete from payments where id=:'P3';
select tests.eqn('setelah refund pembayaran era langganan: available', (select available    from hotel_balance where tenant_id=:'T3'), 930000);
select tests.eqn('setelah refund: lifetime_fee tidak berubah',         (select lifetime_fee from hotel_balance where tenant_id=:'T3'), 70000);

\echo ''
\echo '=== tagihan langganan bulanan (dibayar offline) ==='
-- Periode dinormalkan ke tanggal 1 supaya dua tagihan di bulan yang sama mustahil.
insert into hotel_subscription_invoices (tenant_id, period, amount, updated_by)
  values (:'T3', date '2026-08-17', 500000, 'test');
select tests.eq('periode tagihan dinormalkan ke tanggal 1',
  (select count(*) from hotel_subscription_invoices where tenant_id=:'T3' and period = date '2026-08-01'), 1);
select tests.eq('tagihan baru berstatus unpaid tanpa paid_at',
  (select count(*) from hotel_subscription_invoices
     where tenant_id=:'T3' and status='unpaid' and paid_at is null), 1);
select tests.blocked('tagihan kedua untuk bulan yang sama',
  $$insert into hotel_subscription_invoices (tenant_id, period, amount)
      values ('11111111-1111-4111-8111-111111111133', date '2026-08-01', 500000)$$);

update hotel_subscription_invoices set status='paid', paid_method='transfer', updated_by='test'
  where tenant_id=:'T3' and period = date '2026-08-01';
select tests.eq('ditandai lunas → paid_at terisi',
  (select count(*) from hotel_subscription_invoices
     where tenant_id=:'T3' and status='paid' and paid_at is not null), 1);

update hotel_subscription_invoices set status='unpaid', updated_by='test'
  where tenant_id=:'T3' and period = date '2026-08-01';
select tests.eq('dibatalkan lunas → paid_at ikut dibersihkan',
  (select count(*) from hotel_subscription_invoices
     where tenant_id=:'T3' and status='unpaid' and paid_at is null), 1);

\echo ''
\echo '=== langganan dibayar online: uangnya milik Ventera, saldo hotel diam ==='
-- Inti migration 056. Kalau pelunasan langganan pernah menulis ke `payments`,
-- trigger saldo akan mengkredit hotel dengan uang yang justru ditagihkan
-- kepadanya, lalu memotong 7% dari pendapatan Ventera sendiri. Dua angka di
-- bawah yang menahan itu: saldo dan jumlah baris buku besar harus tidak
-- bergerak sedikit pun oleh pelunasan.
select available as saldo_awal from hotel_balance where tenant_id=:'T3' \gset
select count(*) as ledger_awal from balance_ledger where tenant_id=:'T3' \gset

update hotel_subscription_invoices
   set status='paid', paid_method='xendit', gateway_ref='inv-xnd-1',
       gateway_external_id='GOSTAY-SUB-HOTEL-LANGGANAN-202608',
       gateway_env='test', updated_by='xendit_callback'
 where tenant_id=:'T3' and period = date '2026-08-01';

select tests.eqn('saldo hotel tidak bergerak saat langganan dilunasi',
  (select available from hotel_balance where tenant_id=:'T3'), :saldo_awal);
select tests.eq ('tidak ada baris buku besar baru',
  (select count(*) from balance_ledger where tenant_id=:'T3'), :ledger_awal);
select tests.eq ('pelunasan online tercatat sebagai xendit',
  (select count(*) from hotel_subscription_invoices
     where tenant_id=:'T3' and status='paid' and paid_method='xendit' and paid_at is not null), 1);

-- Idempotensi callback: satu invoice Xendit tidak boleh menempel ke dua tagihan.
insert into hotel_subscription_invoices (tenant_id, period, amount, updated_by)
  values (:'T3', date '2026-09-01', 500000, 'test');
select tests.blocked('id invoice Xendit yang sama dipakai dua tagihan',
  $$update hotel_subscription_invoices set gateway_ref='inv-xnd-1'
      where tenant_id='11111111-1111-4111-8111-111111111133' and period = date '2026-09-01'$$);
