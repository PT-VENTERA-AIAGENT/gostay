-- Reservasi yang sudah LUNAS harus berhenti berstatus 'pending'.
--
-- `recompute_booking_payment()` (migration 019) menghitung ulang amount_paid dan
-- payment_status setiap kali baris `payments` berubah, tapi tidak pernah
-- menyentuh `bookings.status`. Akibatnya sebuah reservasi bisa berdiri dengan
-- payment_status = 'paid' sekaligus status = 'pending' — dan itulah yang dilihat
-- tamu maupun staf: "reservasi masih menunggu" padahal uangnya sudah masuk.
--
-- Yang membuatnya lebih buruk dari sekadar kosmetik: bot WhatsApp menjanjikan
-- "Kamar Anda kami konfirmasi otomatis setelah pembayaran diterima" — janji yang
-- tidak pernah ada kodenya. Ini yang menepatinya.
--
-- Berlaku untuk SEMUA jalur pembayaran, bukan hanya Xendit: kasir yang mencatat
-- pelunasan tunai di front desk juga sudah seharusnya mengonfirmasi reservasinya.

-- ─── Hanya maju, tidak pernah mundur ─────────────────────────────────────────
-- Kenaikan status dibatasi dari 'pending' saja. Reservasi yang sudah
-- 'checked_in'/'checked_out' tidak boleh ditarik kembali ke 'confirmed', dan
-- yang 'cancelled'/'no_show' tidak boleh hidup lagi hanya karena baris pembayaran
-- bergerak (mis. refund dicatat, atau pembayaran dikoreksi). Menurunkan status
-- tamu yang sudah menginap adalah kerusakan yang jauh lebih mahal daripada
-- sebuah status yang tertinggal, jadi arahnya sengaja satu arah.

create or replace function recompute_booking_payment() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare bid uuid; total numeric; paid numeric; new_pay payment_status;
begin
  bid := coalesce(new.booking_id, old.booking_id);
  select total_amount into total from bookings where id = bid;
  select coalesce(sum(amount), 0) into paid from payments where booking_id = bid;

  new_pay := case
    when paid <= 0 then 'pending'::payment_status
    when paid < coalesce(total, 0) then 'partial'::payment_status
    else 'paid'::payment_status end;

  update bookings set
    amount_paid = paid,
    payment_status = new_pay,
    status = case
      when new_pay = 'paid'::payment_status and status = 'pending'::booking_status
        then 'confirmed'::booking_status
      else status end,
    updated_at = now()
  where id = bid;
  return null;
end $$;

-- Trigger-nya tidak berubah (masih trg_recompute_payment dari 019); hanya isi
-- fungsinya yang diganti, jadi tidak perlu drop/create trigger.

-- ─── Perbaiki data yang sudah terlanjur ──────────────────────────────────────
-- Reservasi yang lunas tapi masih 'pending' terjadi sebelum perubahan di atas.
-- Dinaikkan sekali di sini supaya tidak menunggu pembayaran berikutnya (yang
-- untuk reservasi lunas tidak akan pernah datang).
update bookings
   set status = 'confirmed'::booking_status, updated_at = now()
 where payment_status = 'paid'::payment_status
   and status = 'pending'::booking_status;
