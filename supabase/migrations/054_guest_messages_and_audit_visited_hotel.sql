-- Dua policy terakhir yang masih mengunci tamu ke "hotel di profilnya".
--
-- 051 memperbaiki pemesanan, 053 memperbaiki percakapan dan ulasan. Keduanya
-- dicari dengan menyaring nama policy yang diawali "Customer" — dan itu cara
-- yang salah. Dua policy dengan bentuk masalah yang sama persis memakai nama
-- lain, jadi lolos dua kali:
--
--   * `chat_messages` — "Participants can send messages". Percakapannya berhasil
--     dibuat (053), lalu pesan pertama ditolak 403. Hasilnya justru lebih buruk
--     daripada sebelum 053: tamu melihat ruang percakapan yang terbuka dan
--     tampak siap, mengetik, menekan kirim, dan tidak terjadi apa-apa.
--   * `booking_audit_log` — "Actors can insert audit rows in their own name".
--     Setiap pembatalan oleh tamu menulis satu baris audit, jadi tamu
--     lintas-hotel tidak bisa membatalkan pesanannya sendiri.
--
-- Sapuan kali ini berdasarkan PERILAKU, bukan nama: setiap policy yang menyebut
-- get_my_tenant() tanpa dibatasi peran staf. Setelah ini tidak ada lagi yang
-- tersisa di jalur tamu.
--
-- Bentuk penggantinya sama dengan 051/053 — baris terikat ke hotel milik data
-- INDUKNYA (percakapan, pesanan), bukan ke hotel di profil penulisnya. Cabang
-- staf sengaja dipertahankan apa adanya: mereka memang harus terkunci ke
-- hotelnya sendiri.

-- ─── chat_messages ────────────────────────────────────────────────────────────
drop policy if exists "Participants can send messages" on chat_messages;
create policy "Participants can send messages" on chat_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      -- Staf hotel: tetap terkunci ke hotelnya sendiri.
      (public.is_hotel_member() and tenant_id = public.get_my_tenant())
      or
      -- Tamu: pesan ini milik hotel yang sama dengan percakapannya, dan
      -- percakapan itu memang miliknya.
      exists (
        select 1
        from chat_threads t
        join customers c on c.id = t.customer_id
        where t.id = chat_messages.thread_id
          and c.profile_id = auth.uid()
          and t.tenant_id = chat_messages.tenant_id
      )
    )
  );

-- ─── booking_audit_log ────────────────────────────────────────────────────────
drop policy if exists "Actors can insert audit rows in their own name" on booking_audit_log;
create policy "Actors can insert audit rows in their own name" on booking_audit_log for insert
  with check (
    performed_by = auth.uid()
    and (
      (public.is_hotel_member() and tenant_id = public.get_my_tenant())
      or
      exists (
        select 1
        from bookings b
        join customers c on c.id = b.customer_id
        where b.id = booking_audit_log.booking_id
          and c.profile_id = auth.uid()
          and b.tenant_id = booking_audit_log.tenant_id
      )
    )
  );
