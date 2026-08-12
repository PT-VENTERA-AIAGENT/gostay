-- Penagihan manual: menagih di luar jadwal, dan melepas tagihan.
--
-- Penerbitan otomatis (058) hanya tahu satu hal: tarif bulanan hotel, sebulan
-- sekali. Kenyataannya operator butuh dua hal lagi — menagih nominal atau bulan
-- yang tidak mengikuti pola itu, dan MELEPAS tagihan yang tidak jadi ditagih.
--
-- Keduanya sudah bisa dilakukan lewat tabelnya (RLS 055 mengizinkan platform
-- menulis), yang belum ada cuma pengamannya. Itu yang ditambahkan di sini.

-- ─── Tagihan yang sudah ada uangnya tidak boleh dihapus ───────────────────────
-- `subscription_payments.invoice_id` memakai ON DELETE CASCADE, jadi menghapus
-- satu tagihan ikut menghapus catatan uang yang benar-benar sudah diterima
-- Ventera — diam-diam, dan tanpa mengembalikan uangnya. Melepas tagihan yang
-- terlanjur dibayar bukan "hapus", melainkan pembebasan (status 'waived') atau
-- pengembalian dana; keduanya meninggalkan jejak, penghapusan tidak.
create or replace function guard_subscription_invoice_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n int;
begin
  select count(*) into n from subscription_payments where invoice_id = old.id;
  if n > 0 then
    raise exception 'Tagihan ini sudah punya % pembayaran tercatat — bebaskan (waive), jangan dihapus', n
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

drop trigger if exists trg_guard_subscription_invoice_delete on hotel_subscription_invoices;
create trigger trg_guard_subscription_invoice_delete
  before delete on hotel_subscription_invoices
  for each row execute function guard_subscription_invoice_delete();

-- ─── Alasan pembebasan ────────────────────────────────────────────────────────
-- Tagihan yang dibebaskan tanpa keterangan akan jadi teka-teki tiga bulan lagi:
-- tidak ada yang ingat kenapa hotel itu tidak jadi ditagih. Kolomnya sendiri
-- boleh kosong (operator lama tidak akan mengisinya surut), tapi UI mengisinya.
alter table hotel_subscription_invoices
  add column if not exists waived_reason text;

-- Membebaskan tagihan berarti melepaskannya dari perhitungan gerbang: fungsi
-- subscription_gate() hanya menghitung baris ber-status 'unpaid', jadi tidak
-- ada yang perlu diubah di sana — dicatat di sini supaya kaitannya terlihat.
