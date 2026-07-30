-- Seorang tamu boleh melihat hotel-hotel tempat ia menjadi tamu.
--
-- `profiles.tenant_id` menyimpan SATU hotel — tempat orang itu pertama kali
-- muncul. Tapi satu orang bisa menjadi tamu di beberapa hotel sekaligus
-- (`customers` memang satu baris per hotel), dan portal membaca `tenants` tanpa
-- filter sehingga RLS-lah yang menentukan hotel mana yang terlihat. Dengan
-- hanya `id = get_my_tenant()`, seorang tamu yang datang lewat tautan Lor Kali
-- tetap disuguhi hotel pertamanya — Kopi Rintik — dan tidak ada cara apa pun
-- dari sisi aplikasi untuk memperbaikinya, karena baris Lor Kali memang tidak
-- pernah terbaca.
--
-- Policy ini menambah — tidak mengganti — hak baca itu: hotel yang punya baris
-- `customers` atas nama profil ini. Sempit dengan sengaja:
--   * bukan "semua hotel", melainkan hanya yang benar-benar berhubungan dengan
--     orang tersebut;
--   * hanya SELECT, dan hanya kolom identitas hotel yang dibaca portal (nama,
--     logo, alamat) — tidak menyentuh data operasional hotel mana pun;
--   * staf tidak terpengaruh: mereka tetap membaca hotelnya lewat policy lama.
--
-- Tanpa ini, "tamu banyak hotel" adalah keadaan yang sistemnya sendiri tidak
-- bisa tampilkan dengan benar.

drop policy if exists "Guests can view hotels they belong to" on tenants;
create policy "Guests can view hotels they belong to"
  on tenants for select
  using (
    exists (
      select 1 from customers c
      where c.tenant_id = tenants.id
        and c.profile_id = auth.uid()
    )
  );
