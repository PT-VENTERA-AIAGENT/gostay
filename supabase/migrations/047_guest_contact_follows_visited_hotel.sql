-- Kontak seorang tamu dibuat di hotel yang ia DATANGI.
--
-- `customers` adalah satu baris per (orang, hotel) — itu sudah benar. Yang salah
-- adalah cara hotelnya ditentukan: baik pemasang `tenant_id` maupun policy
-- INSERT-nya memakai `get_my_tenant()`, yaitu `profiles.tenant_id` — SATU hotel,
-- tempat orang itu pertama kali muncul.
--
-- Dua akibatnya, dan keduanya terlihat di produksi:
--
--   * Tamu yang membuka portal hotel BARU tidak bisa membuat kontak di sana sama
--     sekali (policy menolak), sehingga chat dan pemesanan lewat portal buntu.
--   * Percakapan yang terbuka adalah percakapan hotel LAIN — tamu di portal Lor
--     Kali membaca sapaan "Kopi Rintik" beserta daftar kamar hotel itu.
--
-- Sejalan dengan 046: tamu mengikuti hotel yang dikunjungi, staf tidak bisa
-- digeser ke mana pun (`current_tenant()` memulangkan hotel staf sendiri tanpa
-- memedulikan header). Karena itu mengganti `get_my_tenant()` dengan
-- `current_tenant()` di sini TIDAK melonggarkan apa pun bagi staf — bagi mereka
-- kedua fungsi itu bernilai sama.

-- ─── Pemasang tenant_id ──────────────────────────────────────────────────────
-- Dipakai banyak tabel sebagai stempel bawaan. Untuk staf nilainya tak berubah;
-- untuk tamu, barisnya kini mendarat di hotel yang sedang dibuka.
create or replace function public.set_tenant_id() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.tenant_id is null then
    new.tenant_id := current_tenant();
  end if;
  return new;
end;
$function$;

-- ─── Tamu boleh punya kontak di hotel yang ia datangi ────────────────────────
-- `profile_id = auth.uid()` yang membuktikan kepemilikan; syarat tenant di sini
-- hanya mencegah barisnya diletakkan di hotel yang tidak sedang dibuka.
drop policy if exists "Signed-in user can create own customer record" on customers;
create policy "Signed-in user can create own customer record"
  on customers for insert
  with check (
    profile_id is not null
    and profile_id = auth.uid()
    and tenant_id = current_tenant()
  );

drop policy if exists "Customer can update own record" on customers;
create policy "Customer can update own record"
  on customers for update
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and tenant_id = current_tenant()
  );
