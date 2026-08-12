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

\echo ''
\echo '=== buku pembayaran: status tagihan diturunkan dari jumlah yang masuk ==='
-- Tagihan September (Rp500.000) dibayar dua kali sebagian: 200rb transfer,
-- lalu 300rb online. Tidak satu pun boleh melunasinya sendirian.
select id as inv_sep from hotel_subscription_invoices
  where tenant_id=:'T3' and period = date '2026-09-01' \gset

insert into subscription_payments (tenant_id, invoice_id, amount, method, recorded_by)
  values (:'T3', :inv_sep, 200000, 'transfer', 'operator');
select tests.eq ('bayar sebagian belum melunasi',
  (select count(*) from hotel_subscription_invoices where id=:inv_sep and status='unpaid'), 1);
select tests.eqn('paid_total mengikuti buku', (select paid_total from hotel_subscription_invoices where id=:inv_sep), 200000);

insert into subscription_payments (tenant_id, invoice_id, amount, method, gateway_ref, gateway_env, recorded_by)
  values (:'T3', :inv_sep, 300000, 'xendit', 'inv-xnd-sep', 'test', 'xendit_callback');
select tests.eq ('sisanya menutup tagihan → lunas',
  (select count(*) from hotel_subscription_invoices where id=:inv_sep and status='paid'), 1);
select tests.eqn('paid_total = 500.000', (select paid_total from hotel_subscription_invoices where id=:inv_sep), 500000);
select tests.eq ('paid_at diambil dari pembayaran PERTAMA, bukan yang terakhir',
  (select count(*) from hotel_subscription_invoices i
     where i.id=:inv_sep
       and i.paid_at = (select min(paid_at) from subscription_payments where invoice_id=:inv_sep)), 1);

-- Pembayaran yang dibatalkan menurunkan statusnya kembali — tidak ada "lunas"
-- yang menggantung tanpa uang di belakangnya.
delete from subscription_payments where invoice_id=:inv_sep and method='xendit';
select tests.eq ('pembayaran dihapus → tagihan kembali belum lunas',
  (select count(*) from hotel_subscription_invoices where id=:inv_sep and status='unpaid' and paid_at is null), 1);

select tests.blocked('callback yang sama mencatat uang dua kali',
  $$insert into subscription_payments (tenant_id, invoice_id, amount, method, gateway_ref)
      select tenant_id, id, 500000, 'xendit', 'inv-xnd-dup'
        from hotel_subscription_invoices where period = date '2026-09-01'
      union all
      select tenant_id, id, 500000, 'xendit', 'inv-xnd-dup'
        from hotel_subscription_invoices where period = date '2026-09-01'$$);

select tests.eqn('saldo hotel TETAP tidak tersentuh oleh buku langganan',
  (select available from hotel_balance where tenant_id=:'T3'), 930000);

\echo ''
\echo '=== gerbang tunggakan: jatuh tempo + 7 hari ==='
-- Hotel uji sendiri, supaya tanggalnya bisa diatur tanpa mengganggu yang lain.
\set T4 '11111111-1111-4111-8111-111111111144'
insert into tenants (id, name) values (:'T4', 'Hotel Nunggak');
-- Berlangganan sejak 3 bulan lalu, jatuh tempo tanggal 1, belum bayar sama sekali.
insert into hotel_payment_config (tenant_id, billing_mode, subscription_amount, subscription_day, subscription_since, updated_by)
  values (:'T4', 'subscription', 500000, 1, (date_trunc('month', current_date) - interval '3 months')::date, 'test');

select tests.eq('menunggak berbulan-bulan → tergerbang',
  (select count(*) from subscription_gate(:'T4') where gated), 1);
select tests.eq('yang ditagih adalah bulan TERTUA, bukan yang terbaru',
  (select count(*) from subscription_gate(:'T4')
     where period = (date_trunc('month', current_date) - interval '3 months')::date), 1);

-- Hotel yang baru bergabung hari ini tidak boleh langsung tergerbang, meski
-- tanggal jatuh temponya (tgl 1) sudah lewat bulan ini.
\set T5 '11111111-1111-4111-8111-111111111155'
insert into tenants (id, name) values (:'T5', 'Hotel Baru');
insert into hotel_payment_config (tenant_id, billing_mode, subscription_amount, subscription_day, subscription_since, updated_by)
  values (:'T5', 'subscription', 500000, 1, current_date, 'test');
select tests.eq('hotel yang baru berlangganan hari ini tidak tergerbang',
  (select count(*) from subscription_gate(:'T5') where gated), 0);

-- Batas persisnya: tepat 7 hari lewat = tergerbang, 6 hari = belum.
\set T6 '11111111-1111-4111-8111-111111111166'
insert into tenants (id, name) values (:'T6', 'Hotel Batas');
insert into hotel_payment_config (tenant_id, billing_mode, subscription_amount, subscription_day, subscription_since, updated_by)
  values (:'T6', 'subscription', 500000, 1, (current_date - interval '6 days')::date, 'test');
select tests.eq('6 hari lewat jatuh tempo: belum tergerbang',
  (select count(*) from subscription_gate(:'T6') where gated), 0);
update hotel_payment_config set subscription_since = (current_date - interval '7 days')::date where tenant_id=:'T6';
select tests.eq('tepat 7 hari lewat jatuh tempo: tergerbang',
  (select count(*) from subscription_gate(:'T6') where gated), 1);

-- Membayar membuka gerbangnya, dan TIDAK menggeser tanggal tagih berikutnya.
insert into hotel_subscription_invoices (tenant_id, period, amount, updated_by)
  values (:'T6', date_trunc('month', current_date - interval '7 days')::date, 500000, 'test');
insert into subscription_payments (tenant_id, invoice_id, amount, method, recorded_by)
  select tenant_id, id, 500000, 'transfer', 'operator' from hotel_subscription_invoices
   where tenant_id=:'T6' order by period limit 1;
select tests.eq('setelah dibayar: gerbang terbuka',
  (select count(*) from subscription_gate(:'T6') where gated), 0);

\echo ''
\echo '=== penerbitan tagihan menambal semua bulan yang terlewat ==='
select tests.eq('tiga bulan tertunggak diterbitkan sekaligus',
  (select ensure_subscription_invoices(:'T4')), 4);   -- 3 bulan lalu s/d bulan ini
select tests.eq('dijalankan lagi tidak membuat tagihan kembar',
  (select ensure_subscription_invoices(:'T4')), 0);
select tests.eq('tagihan yang sudah lunas tidak diterbitkan ulang',
  (select count(*) from hotel_subscription_invoices where tenant_id=:'T6'), 1);

\echo ''
\echo '=== penagihan manual: tagih di luar jadwal, dan lepas tagihan ==='
-- Tagih manual: bulan dan nominal yang tidak mengikuti pola langganan.
insert into hotel_subscription_invoices (tenant_id, period, amount, note, updated_by)
  values (:'T4', date '2026-11-01', 1250000, 'setup awal', 'operator');
select tests.eqn('tagihan manual tercatat dengan nominalnya sendiri',
  (select amount from hotel_subscription_invoices where tenant_id=:'T4' and period=date '2026-11-01'), 1250000);
select tests.blocked('menagih bulan yang sudah punya tagihan',
  $$insert into hotel_subscription_invoices (tenant_id, period, amount)
      values ('11111111-1111-4111-8111-111111111144', date '2026-11-01', 999)$$);

-- Melepas tagihan mengeluarkannya dari gerbang, tapi barisnya tetap ada.
select tests.eq('sebelum dibebaskan: masih tergerbang',
  (select count(*) from subscription_gate(:'T4') where gated), 1);
update hotel_subscription_invoices set status='waived', waived_reason='promo bulan pertama'
  where tenant_id=:'T4';
select tests.eq('semua tagihan dibebaskan → gerbang terbuka',
  (select count(*) from subscription_gate(:'T4') where gated), 0);
select tests.eq('barisnya tetap ada beserta alasannya',
  (select count(*) from hotel_subscription_invoices
     where tenant_id=:'T4' and status='waived' and waived_reason is not null), 5);

-- Ditagih lagi: pembebasan dicabut, gerbang kembali.
update hotel_subscription_invoices set status='unpaid', waived_reason=null where tenant_id=:'T4';
select tests.eq('pembebasan dicabut → tergerbang lagi',
  (select count(*) from subscription_gate(:'T4') where gated), 1);

-- Tagihan yang sudah ada uangnya tidak boleh dihapus: ON DELETE CASCADE akan
-- ikut menghapus catatan uang yang benar-benar sudah diterima Ventera.
insert into subscription_payments (tenant_id, invoice_id, amount, method, recorded_by)
  select tenant_id, id, 1250000, 'transfer', 'operator' from hotel_subscription_invoices
   where tenant_id=:'T4' and period=date '2026-11-01';
select tests.blocked('menghapus tagihan yang sudah ada pembayarannya',
  $$delete from hotel_subscription_invoices
      where tenant_id='11111111-1111-4111-8111-111111111144' and period=date '2026-11-01'$$);
select tests.eq('catatan pembayarannya utuh',
  (select count(*) from subscription_payments where tenant_id=:'T4'), 1);

-- Tautan Xendit yang sudah terbit tapi BELUM dibayar sama berbahayanya: kalau
-- barisnya lenyap, pembayaran atas tautan itu tidak menemukan tagihannya dan
-- uangnya masuk tanpa catatan.
update hotel_subscription_invoices set gateway_ref='inv-hidup'
  where tenant_id=:'T4' and period=date_trunc('month', current_date)::date;
select tests.blocked('menghapus tagihan yang tautan Xendit-nya masih terbit',
  $$delete from hotel_subscription_invoices
      where tenant_id='11111111-1111-4111-8111-111111111144'
        and period=date_trunc('month', current_date)::date$$);
update hotel_subscription_invoices set gateway_ref=null
  where tenant_id=:'T4' and period=date_trunc('month', current_date)::date;

-- Yang bersih boleh dihapus — untuk membetulkan salah terbit. Periodenya harus
-- yang BENAR-BENAR ada, kalau tidak DELETE-nya kena 0 baris dan tidak pernah
-- melewati jalur "boleh" di trigger sama sekali.
select tests.eq('tagihan yang mau dihapus memang ada',
  (select count(*) from hotel_subscription_invoices
     where tenant_id=:'T4' and period=date_trunc('month', current_date)::date), 1);
select tests.allowed('menghapus tagihan yang bersih',
  $$delete from hotel_subscription_invoices
      where tenant_id='11111111-1111-4111-8111-111111111144'
        and period=date_trunc('month', current_date)::date$$);
select tests.eq('tagihannya benar-benar hilang',
  (select count(*) from hotel_subscription_invoices
     where tenant_id=:'T4' and period=date_trunc('month', current_date)::date), 0);

\echo ''
\echo '=== mencabut pembebasan menurunkan status dari buku, bukan menebaknya ==='
-- Tagihan dibebaskan LALU tetap dibayar hotel. Menekan "Tagih lagi" tidak boleh
-- membuatnya jadi belum-bayar — itu akan mengunci hotel yang sudah membayar.
\set T7 '11111111-1111-4111-8111-111111111177'
insert into tenants (id, name) values (:'T7', 'Hotel Dibebaskan');
insert into hotel_payment_config (tenant_id, billing_mode, subscription_amount, subscription_day, subscription_since, updated_by)
  values (:'T7', 'subscription', 400000, 1, (current_date - interval '40 days')::date, 'test');
insert into hotel_subscription_invoices (tenant_id, period, amount, updated_by)
  values (:'T7', date_trunc('month', current_date - interval '40 days')::date, 400000, 'test');
select id as inv7 from hotel_subscription_invoices where tenant_id=:'T7' \gset

update hotel_subscription_invoices set status='waived', waived_reason='promo' where id=:inv7;
insert into subscription_payments (tenant_id, invoice_id, amount, method, recorded_by)
  values (:'T7', :inv7, 400000, 'xendit', 'callback');
select tests.eq('dibebaskan lalu tetap dibayar: statusnya tetap dibebaskan',
  (select count(*) from hotel_subscription_invoices where id=:inv7 and status='waived'), 1);
select tests.eqn('tapi uangnya tercatat', (select paid_total from hotel_subscription_invoices where id=:inv7), 400000);

update hotel_subscription_invoices set status='unpaid' where id=:inv7;
select tests.eq('cabut pembebasan → LUNAS, bukan belum bayar (uangnya sudah masuk)',
  (select count(*) from hotel_subscription_invoices where id=:inv7 and status='paid'), 1);
select tests.eq('alasan pembebasan ikut dibersihkan',
  (select count(*) from hotel_subscription_invoices where id=:inv7 and waived_reason is null), 1);
-- T7 memang masih menunggak BULAN BERJALAN (yang dibayar bulan sebelumnya),
-- jadi yang dibuktikan bukan "tidak tergerbang" melainkan: bulan yang uangnya
-- sudah masuk tidak lagi jadi alasan gerbang.
select tests.eq('bulan yang sudah dibayar tidak lagi jadi alasan gerbang',
  (select count(*) from subscription_gate(:'T7')
     where period = date_trunc('month', current_date - interval '40 days')::date), 0);
