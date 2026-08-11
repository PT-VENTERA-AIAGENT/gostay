-- Percakapan dan ulasan tamu, di hotel yang ia DATANGI.
--
-- 051 sudah memindahkan pemesanan dari "hotel di profil tamu" ke "hotel yang
-- sedang dibuka". Dua policy bersaudara tertinggal dengan bentuk yang persis
-- sama, dan keduanya baru terasa setelah tamu terlanjur sampai di sana:
--
--   * `chat_threads` INSERT — tombol "Pesan"/"Contact Hotel". Seorang tamu yang
--     profilnya milik hotel lain tidak bisa memulai percakapan sama sekali.
--     Ini yang paling merugikan: setiap pesan galat di portal menyarankan
--     "hubungi hotel lewat menu Pesan" sebagai jalan keluar — dan jalan keluar
--     itu sendiri buntu untuk orang yang paling membutuhkannya.
--   * `reviews` INSERT — tamu yang sudah menginap tidak bisa menulis ulasan di
--     hotel kedua yang ia datangi.
--
-- Penggantinya sama dengan 051, dan bukan `current_tenant()`: fungsi itu
-- digerakkan header dari peramban, dan untuk MENULIS baris itu terlalu longgar.
-- Yang dipakai invarian sebenarnya — baris ini milik hotel yang sama dengan
-- KONTAK yang dipakainya. `customers` adalah satu baris per (orang, hotel),
-- dibuat 047 di hotel yang dikunjungi, dan sudah wajib milik pemanggil.
--
-- Seperti 051, hasilnya justru LEBIH ketat: bentuk lama tidak pernah memeriksa
-- bahwa kontaknya berasal dari hotel yang sama dengan barisnya, jadi sebuah
-- percakapan bisa menempel pada kontak milik hotel lain.

drop policy if exists "Customer can create threads" on chat_threads;
create policy "Customer can create threads" on chat_threads for insert
  with check (
    exists (
      select 1 from customers c
      where c.id = chat_threads.customer_id
        and c.profile_id = auth.uid()
        -- Kualifikasi `chat_threads.` wajib: tanpa itu `tenant_id` terbaca
        -- sebagai kolom `customers` dan syaratnya jadi tautologi.
        and c.tenant_id = chat_threads.tenant_id
    )
  );

drop policy if exists "Customer can write own review" on reviews;
create policy "Customer can write own review" on reviews for insert
  with check (
    exists (
      select 1 from customers c
      where c.id = reviews.customer_id
        and c.profile_id = auth.uid()
        and c.tenant_id = reviews.tenant_id
    )
  );
