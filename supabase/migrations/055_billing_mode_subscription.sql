-- Dua model tagihan Ventera, dipilih per hotel oleh super admin.
--
-- Sampai sekarang Ventera hanya punya satu cara memungut: potongan 7% dari tiap
-- pembayaran reservasi, dipotong di dalam DB oleh trigger credit_hotel_balance()
-- (031/036). Sebagian pemilik hotel tidak mau dipotong dan lebih memilih bayar
-- biaya tetap tiap bulan — ditransfer sendiri ke Ventera, DI LUAR aplikasi
-- (offline). Migration ini membuat pilihan itu ada:
--
--   commission   (bawaan) — potongan platform_fee_bps (700 bps = 7%) tiap payment
--   subscription          — 0% potongan; hotel bayar langganan bulanan offline
--
-- Letaknya di `hotel_payment_config`, tetangga sebelah saklar live/test, karena
-- keduanya adalah keputusan platform tentang satu hotel dan sudah punya RLS yang
-- persis dibutuhkan: hotel boleh MEMBACA barisnya, hanya platform_admin_scope()
-- yang boleh MENULIS (035:189). Itu bukan detail administratif — kalau hotel
-- bisa menulis kolom ini, hotel bisa menihilkan fee-nya sendiri.
--
-- Model tagihan TEGAK LURUS dengan mode live/test: hotel langganan tetap boleh
-- menerima pembayaran Xendit live, Ventera saja yang tidak mengambil potongan.
--
-- URUTAN PENERAPAN PENTING: file ini mengganti trigger audit 032 dari BEFORE
-- menjadi AFTER (lihat alasannya di bawah). Menjalankan ULANG 032 setelah 055
-- tidak membuat tulisan gagal — 032 mengganti fungsi DAN triggernya sekaligus,
-- jadi keduanya kembali konsisten ke versi BEFORE. Yang hilang: kolom audit
-- *_billing/*_amount berhenti terisi, dan bug baris audit ganda pada upsert
-- kembali. Kalau 032 harus dijalankan ulang, jalankan 055 lagi sesudahnya.

-- ─── Kolom model tagihan ──────────────────────────────────────────────────────
alter table hotel_payment_config
  add column if not exists billing_mode text not null default 'commission'
    check (billing_mode in ('commission','subscription')),
  -- Tarif langganan per bulan (rupiah). Hanya berarti saat billing_mode='subscription'.
  add column if not exists subscription_amount numeric(14,2) not null default 0
    check (subscription_amount >= 0),
  -- Tanggal jatuh tempo tiap bulan. Dibatasi 1–28 supaya ada di semua bulan
  -- (29–31 akan hilang di Februari dan membuat "jatuh tempo" tidak terdefinisi).
  add column if not exists subscription_day int not null default 1
    check (subscription_day between 1 and 28),
  -- Sejak kapan hotel ini berlangganan; dipakai untuk tidak menagih bulan-bulan
  -- sebelum ia pindah model.
  add column if not exists subscription_since date;

-- ─── Jejak audit ──────────────────────────────────────────────────────────────
-- Tabel audit 032 hanya merekam pergantian live/test. Pindah model tagihan
-- adalah keputusan uang yang jauh lebih besar (7% → 0%), jadi ia ikut direkam di
-- jejak yang sama, bukan di tabel baru yang harus dibaca terpisah.
alter table hotel_payment_mode_audit
  add column if not exists old_billing text,
  add column if not exists new_billing text,
  add column if not exists old_amount  numeric(14,2),
  add column if not exists new_amount  numeric(14,2);

-- Auditnya dipindah dari BEFORE ke AFTER, dan penstempelan updated_at dipisah
-- ke fungsinya sendiri. Alasannya bukan kerapian: seluruh tulisan ke tabel ini
-- datang sebagai `insert ... on conflict do update` (upsert dari konsol), dan
-- pada bentuk itu Postgres tetap menjalankan trigger BEFORE INSERT untuk baris
-- yang DIUSULKAN sebelum tahu akan bentrok — lalu menjalankan trigger UPDATE.
-- Trigger BEFORE 032 karena itu menulis DUA baris audit tiap kali operator
-- menyentuh hotel yang sudah punya konfigurasi: satu baris hantu berbunyi
-- "hotel ini baru saja disetel pertama kali" (old_mode kosong) yang tidak
-- pernah terjadi. Trigger AFTER INSERT tidak jalan bila jalur konflik diambil,
-- jadi versi ini merekam tepat satu baris: yang benar-benar berubah.
create or replace function touch_hotel_payment_config() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function log_hotel_payment_mode() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  mode_changed    boolean;
  billing_changed boolean;
begin
  mode_changed := (tg_op = 'INSERT' and new.mode is not null)
                  or (tg_op = 'UPDATE' and new.mode is distinct from old.mode);
  billing_changed := (tg_op = 'INSERT' and new.billing_mode is distinct from 'commission')
                     or (tg_op = 'UPDATE' and (new.billing_mode        is distinct from old.billing_mode
                                            or new.subscription_amount is distinct from old.subscription_amount));

  if mode_changed or billing_changed then
    insert into hotel_payment_mode_audit(
      tenant_id, old_mode, new_mode, old_billing, new_billing, old_amount, new_amount, changed_by)
    values (
      new.tenant_id,
      case when tg_op = 'UPDATE' then old.mode                else null end,
      new.mode,
      case when tg_op = 'UPDATE' then old.billing_mode        else null end,
      new.billing_mode,
      case when tg_op = 'UPDATE' then old.subscription_amount else null end,
      new.subscription_amount,
      new.updated_by);
  end if;
  return null;   -- trigger AFTER: nilai kembaliannya diabaikan
end $$;

drop trigger if exists trg_hotel_payment_mode on hotel_payment_config;
drop trigger if exists trg_hotel_payment_config_touch on hotel_payment_config;
create trigger trg_hotel_payment_config_touch
  before insert or update on hotel_payment_config
  for each row execute function touch_hotel_payment_config();
create trigger trg_hotel_payment_mode
  after insert or update on hotel_payment_config
  for each row execute function log_hotel_payment_mode();

-- ─── Penyelesai: model tagihan & tarif fee efektif satu hotel ─────────────────
create or replace function hotel_billing_mode(p_tenant uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select billing_mode from hotel_payment_config where tenant_id = p_tenant),
    'commission');
$$;
-- Hanya service_role. Keduanya SECURITY DEFINER (menembus RLS) dan satu-satunya
-- pemanggilnya adalah trigger credit_hotel_balance() yang sudah berjalan sebagai
-- pemilik. Memberikannya ke `anon` seperti hotel_payment_mode() di 032 akan
-- membuat siapa pun tanpa login bisa membaca syarat komersial hotel mana pun
-- lewat /rest/v1/rpc. (hotel_payment_mode() di 032 memang pernah diberikan ke
-- anon, tapi 034:139 sudah mencabutnya — tidak ada lagi RPC pembayaran yang
-- terbuka untuk anon, dan dua fungsi ini tidak boleh jadi yang pertama.)
-- `from public` saja tidak cukup: kalau versi migration ini pernah dijalankan
-- dengan grant ke anon/authenticated, hak itu eksplisit dan tidak ikut tercabut.
revoke all on function hotel_billing_mode(uuid) from public, anon, authenticated;
grant execute on function hotel_billing_mode(uuid) to service_role;

-- Tarif yang benar-benar dipotong dari pendapatan satu hotel, dalam bps.
-- Hotel langganan = 0. Selain itu tarif global payment_config (700 = 7%).
-- Cadangan 700 dipakai kalau baris konfigurasi global hilang — sengaja sama
-- dengan default feeSplit() di api/_lib/payment/fee.ts.
create or replace function hotel_fee_bps(p_tenant uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when hotel_billing_mode(p_tenant) = 'subscription' then 0
    else coalesce((select platform_fee_bps from payment_config where id = true), 700)
  end;
$$;
revoke all on function hotel_fee_bps(uuid) from public, anon, authenticated;
grant execute on function hotel_fee_bps(uuid) to service_role;

-- ─── Trigger uang: pakai tarif per hotel, bukan tarif global ──────────────────
-- Satu-satunya perubahan terhadap 031: `bps` sekarang datang dari
-- hotel_fee_bps(tenant), sehingga hotel langganan dikredit UTUH. Sisa
-- aritmetikanya tidak disentuh — gross = fee + net tetap berlaku (fee 0 → net
-- = gross), dan fee_bps tercatat per baris ledger sehingga tiap penerimaan
-- menerangkan sendiri tarif yang berlaku saat itu.
create or replace function credit_hotel_balance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  bps     int;
  billing text;
  gross   numeric(14,2);
  fee     numeric(14,2);
  net     numeric(14,2);
begin
  billing := hotel_billing_mode(new.tenant_id);
  bps     := hotel_fee_bps(new.tenant_id);
  gross   := new.amount;
  fee     := round(gross * bps / 10000.0, 2);
  net     := gross - fee;

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
     case when billing = 'subscription'
          then 'Pendapatan reservasi (langganan bulanan — tanpa potongan)'
          else 'Pendapatan reservasi (potong fee ' || trim_scale((bps / 100.0)::numeric) || '%)'
     end);

  return null;
end $$;

-- ─── Tagihan langganan bulanan (dibayar offline) ──────────────────────────────
-- Uangnya tidak lewat GoStay sama sekali: hotel transfer ke Ventera, lalu
-- operator menandai lunas di konsol. Tabel ini adalah catatan tagihan itu —
-- satu baris per hotel per bulan — supaya "hotel mana yang belum bayar bulan
-- ini" punya jawaban, bukan hanya ada di kepala orang.
create table if not exists hotel_subscription_invoices (
  id          bigserial primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  period      date not null,                     -- selalu tanggal 1 bulan yang ditagih
  amount      numeric(14,2) not null check (amount >= 0),
  status      text not null default 'unpaid' check (status in ('unpaid','paid','waived')),
  paid_at     timestamptz,
  paid_method text,                              -- 'transfer' | 'cash' | keterangan bebas
  note        text,
  updated_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, period)
);
create index if not exists idx_hotel_subscription_invoices_period
  on hotel_subscription_invoices(period desc, status);

-- Menormalkan periode ke tanggal 1 sebelum UNIQUE diuji (klien boleh mengirim
-- tanggal berapa pun di dalam bulan itu tanpa membuat tagihan kembar), dan
-- menjaga paid_at selalu konsisten dengan status.
create or replace function stamp_subscription_invoice() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.period := date_trunc('month', new.period)::date;
  if new.status = 'paid' then
    new.paid_at := coalesce(new.paid_at, now());
  else
    new.paid_at := null;   -- kembali ke unpaid/waived = belum ada uang masuk
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_stamp_subscription_invoice on hotel_subscription_invoices;
create trigger trg_stamp_subscription_invoice
  before insert or update on hotel_subscription_invoices
  for each row execute function stamp_subscription_invoice();

-- RLS: hotel boleh MELIHAT tagihannya sendiri (halaman Saldo menampilkannya);
-- hanya platform yang boleh membuat/menandai lunas — status lunas adalah
-- pengakuan Ventera sudah menerima transfer, bukan klaim hotel.
alter table hotel_subscription_invoices enable row level security;

drop policy if exists hotel_subscription_invoices_read on hotel_subscription_invoices;
create policy hotel_subscription_invoices_read on hotel_subscription_invoices
  for select to authenticated
  using (public.platform_admin_scope()
         or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));

drop policy if exists hotel_subscription_invoices_write on hotel_subscription_invoices;
create policy hotel_subscription_invoices_write on hotel_subscription_invoices
  for all to authenticated
  using (public.platform_admin_scope())
  with check (public.platform_admin_scope());
