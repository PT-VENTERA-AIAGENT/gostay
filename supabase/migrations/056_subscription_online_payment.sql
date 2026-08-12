-- Langganan bulanan bisa dibayar online lewat Xendit, lunas otomatis.
--
-- Sampai 055, tagihan langganan hanya bisa lunas kalau operator menandainya
-- sendiri setelah transfer masuk. Itu benar untuk pembayaran offline, tapi
-- berarti hotel tahu harus bayar tanpa tahu ke mana, dan setiap bulan ada
-- pekerjaan tangan yang bisa terlupa. Migration ini memberi tagihan itu tautan
-- pembayaran Xendit dan jalan pulang otomatis lewat webhook yang sudah ada.
--
-- SATU HAL YANG TIDAK BOLEH KELIRU: uang langganan adalah milik VENTERA, bukan
-- hotel. Jalur ini karena itu TIDAK PERNAH menulis ke tabel `payments`. Satu
-- baris di sana akan memicu credit_hotel_balance() — mengkredit saldo hotel
-- dengan uang yang justru ditagihkan kepadanya, sekaligus memotong 7% dari
-- pendapatan Ventera sendiri. Pelunasan langganan hanya menyentuh tabel ini.

-- ─── Jejak invoice Xendit pada tiap tagihan ───────────────────────────────────
alter table hotel_subscription_invoices
  -- id invoice di Xendit; dipakai webhook untuk menemukan barisnya dengan pasti.
  add column if not exists gateway_ref text,
  -- external_id yang KAMI kirim. Disimpan apa adanya supaya webhook tidak perlu
  -- mengurai kembali nama hotel dari string yang sudah dinormalkan (lossy).
  add column if not exists gateway_external_id text,
  add column if not exists gateway_url text,
  add column if not exists gateway_env text check (gateway_env in ('live','test')),
  add column if not exists gateway_issued_at timestamptz,
  -- Invoice Xendit kedaluwarsa (bawaan 24 jam) dan external_id-nya tidak boleh
  -- dipakai ulang, jadi percobaan berikutnya diberi sufiks -R<n>.
  add column if not exists gateway_attempt int not null default 0;

-- Kunci idempotensi. Webhook boleh datang berkali-kali untuk invoice yang sama;
-- keduanya UNIQUE supaya satu invoice Xendit tidak bisa menempel ke dua tagihan.
create unique index if not exists uq_hsi_gateway_ref
  on hotel_subscription_invoices(gateway_ref) where gateway_ref is not null;
create unique index if not exists uq_hsi_gateway_external_id
  on hotel_subscription_invoices(gateway_external_id) where gateway_external_id is not null;

-- ─── Lingkungan pembayaran untuk tagihan Ventera sendiri ──────────────────────
-- Sengaja TERPISAH dari payment_config.mode (yang mengatur pembayaran tamu ke
-- hotel) dan dari hotel_payment_config.mode. Dua alasan:
--
--   1. Hotel yang masih 'test' tetap berutang uang sungguhan. Menagihnya lewat
--      sandbox berarti tagihannya tidak pernah benar-benar terbayar.
--   2. Kalau ini menumpang payment_config.mode, menyalakan penagihan langganan
--      live akan sekaligus memindahkan SETIAP hotel yang belum punya baris
--      hotel_payment_config ke live lewat jalur fallback — efek samping yang
--      tidak ada hubungannya dengan langganan.
alter table payment_config
  add column if not exists subscription_mode text not null default 'test'
    check (subscription_mode in ('live','test'));

-- Perubahannya ikut terekam di jejak yang sama dengan mode/fee. log_payment_config()
-- dari 030 hanya membandingkan mode dan platform_fee_bps, jadi kolom barunya
-- ditambahkan ke tabel audit dan ke fungsinya.
alter table payment_mode_audit
  add column if not exists old_subscription_mode text,
  add column if not exists new_subscription_mode text;

create or replace function log_payment_config() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.mode is distinct from old.mode
     or new.platform_fee_bps is distinct from old.platform_fee_bps
     or new.subscription_mode is distinct from old.subscription_mode then
    insert into payment_mode_audit(
      old_mode, new_mode, old_fee_bps, new_fee_bps,
      old_subscription_mode, new_subscription_mode, changed_by)
    values (old.mode, new.mode, old.platform_fee_bps, new.platform_fee_bps,
            old.subscription_mode, new.subscription_mode, new.updated_by);
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Trigger-nya sendiri tidak berubah bentuk (before update on payment_config),
-- tapi dipasang ulang supaya berkas ini utuh kalau dijalankan di basis kosong.
drop trigger if exists trg_payment_config on payment_config;
create trigger trg_payment_config
  before update on payment_config
  for each row execute function log_payment_config();
