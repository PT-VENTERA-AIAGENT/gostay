-- Seorang tamu memesan di hotel yang ia DATANGI.
--
-- 045, 046, dan 047 sudah memindahkan tamu dari "hotel di profilnya" ke "hotel
-- yang sedang dibuka" — berturut-turut untuk membaca `tenants`, untuk
-- `current_tenant()`, dan untuk membuat baris `customers`. Policy INSERT pada
-- `bookings` tertinggal, dan ia yang paling akhir terasa: seluruh perjalanan
-- tamu berjalan mulus — brosur benar, kamar benar, tarif benar, kontak
-- terbentuk — lalu tombol terakhir dijawab 403 tanpa penjelasan.
--
-- Syarat lamanya `tenant_id = get_my_tenant()`, yaitu `profiles.tenant_id`:
-- SATU hotel, tempat orang itu pertama kali muncul. Akibatnya siapa pun yang
-- pernah menyentuh hotel lain tidak akan pernah bisa memesan di hotel kedua.
-- Terlihat di produksi: seorang tamu berprofil hotel A membuka portal hotel B,
-- mengisi seluruh formulir, dan ditolak di langkah terakhir.
--
-- ─── Yang menggantikannya ────────────────────────────────────────────────────
-- Bukan `current_tenant()`. Fungsi itu digerakkan header dari peramban, dan
-- untuk pembacaan brosur itu memang aman (046) — tapi menulis baris booking
-- berdasarkan header adalah hal lain.
--
-- Yang dipakai adalah invarian yang sebenarnya: sebuah booking milik hotel yang
-- sama dengan KONTAK yang dipakainya. `customers` adalah satu baris per (orang,
-- hotel), dibuat 047 di hotel yang dikunjungi, dan barisnya sudah wajib milik
-- pemanggil. Mengikat `bookings.tenant_id` ke `customers.tenant_id` membuat
-- hotelnya ditentukan data yang sudah terverifikasi, bukan header maupun profil.
--
-- Ini justru LEBIH ketat dari sebelumnya: syarat lama tidak pernah memeriksa
-- bahwa kontak yang dipakai berasal dari hotel yang sama dengan booking-nya,
-- jadi sebuah booking bisa menempel pada kontak milik hotel lain.
--
-- Yang lain tidak berubah: tetap harus `pending`, belum dibayar, dan
-- `source='portal'` — sebuah peramban tidak boleh mencetak booking terkonfirmasi
-- atau menginap gratis.

drop policy if exists "Customer can create own bookings" on bookings;
create policy "Customer can create own bookings" on bookings for insert
  with check (
    exists (
      select 1
      from customers c
      where c.id = bookings.customer_id
        and c.profile_id = auth.uid()
        -- Kualifikasi `bookings.` wajib: tanpa itu `tenant_id` terbaca sebagai
        -- kolom `customers` di dalam subquery dan syaratnya jadi tautologi.
        and c.tenant_id = bookings.tenant_id
    )
    and status = 'pending'::booking_status
    and payment_status = 'pending'::payment_status
    and amount_paid = 0::numeric
    and source = 'portal'::booking_source
  );
