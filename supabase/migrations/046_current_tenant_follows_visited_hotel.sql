-- Portal seorang TAMU harus mengikuti hotel yang ia datangi.
--
-- `current_tenant()` menjawab "hotel mana yang sedang dilihat", dan hampir semua
-- bacaan portal bergantung padanya: `room_types`, `rooms`, `reviews`,
-- `seasonal_pricing`, `pos_products`. Sebelumnya ia mendahulukan
-- `get_my_tenant()` untuk siapa pun yang sudah login — yaitu `profiles.tenant_id`,
-- SATU hotel: tempat orang itu pertama kali muncul.
--
-- Akibatnya seorang tamu yang membuka tautan Lor Kali dan login melihat kamar,
-- tarif, ulasan, dan menu milik hotel LAIN — hotel pertamanya. Bukan hanya nama
-- di kop halaman, tapi seluruh isinya. Selama ia belum login semuanya benar,
-- karena jalur anonim memang membaca header; login-lah yang membelokkannya.
--
-- ─── Yang berubah ────────────────────────────────────────────────────────────
-- Tamu (dan pengunjung anonim) mengikuti hotel yang sedang dibuka, dari header
-- `x-tenant-slug` yang dikirim klien. Staf/admin TIDAK: mereka selalu terkunci
-- ke hotelnya sendiri.
--
-- Perbedaan itu bukan gaya, melainkan batas keamanan. Header berasal dari
-- browser, jadi ia tidak boleh menggerakkan seorang staf ke hotel lain — itu
-- akan membuka data operasional hotel yang bukan miliknya hanya dengan menyetel
-- satu header. Untuk tamu, header hanya memilih di antara data yang memang sudah
-- boleh dibaca siapa saja: tipe kamar aktif, tarif, ulasan terbit, menu aktif.
-- Data pribadi tamu (booking, percakapan, permintaan) tidak lewat sini sama
-- sekali — semuanya diikat ke `customers.profile_id`.

create or replace function public.current_tenant() returns uuid
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  t   uuid;
  hdr text;
  n   int;
  r   user_role;
begin
  -- Staf/admin: selalu hotelnya sendiri. Sebuah header dari browser tidak boleh
  -- memindahkan mereka ke hotel lain.
  r := get_my_role();
  if r in ('staff'::user_role, 'admin'::user_role) then
    return get_my_tenant();
  end if;

  -- Tamu atau pengunjung anonim: hotel yang portalnya sedang dibuka.
  begin
    hdr := nullif(current_setting('request.headers', true)::json ->> 'x-tenant-slug', '');
  exception when others then
    hdr := null;
  end;

  if hdr is not null then
    select id into t from tenants where slug = hdr and is_active;
    if t is not null then
      return t;
    end if;
    -- Slug tak dikenal: jangan diam-diam jatuh ke hotel lain. Lanjut ke bawah,
    -- tempat satu-satunya jawaban jujur diberikan.
  end if;

  -- Tanpa header: seorang tamu yang sudah login masih punya hotel asalnya, dan
  -- itu jawaban terbaik yang ada.
  t := get_my_tenant();
  if t is not null then
    return t;
  end if;

  -- Tanpa header, tanpa sesi. Selama hanya ada satu hotel di sini, dialah yang
  -- sedang dilihat — portal tetap jalan tanpa setiap pemanggil mengumumkan diri.
  -- Dengan dua atau lebih, pertanyaannya tak punya jawaban jujur, jadi tolak
  -- daripada menebak.
  select count(*) into n from tenants where is_active;
  if n <> 1 then
    return null;
  end if;

  select id into t from tenants where is_active;
  return t;
end;
$function$;

-- Menu room service: sekelas dengan tipe kamar dan tarif, yang sudah memakai
-- `current_tenant()`. Sebelumnya `get_my_tenant()`, sehingga tamu di hotel yang
-- ia datangi melihat menu hotel lain — atau tidak melihat apa pun.
drop policy if exists pos_products_guest_read on pos_products;
create policy pos_products_guest_read
  on pos_products for select
  using (is_active and tenant_id = current_tenant());

-- Identitas hotel yang SEDANG DIBUKA harus terbaca, sama seperti tipe kamar dan
-- tarifnya. Tanpa ini, seorang tamu yang membuka portal hotel yang belum pernah
-- ia datangi tidak bisa membaca nama hotelnya sendiri: policy lain hanya
-- memulangkan hotel yang sudah berhubungan dengannya, sehingga portal jatuh ke
-- hotel lain — persis kekeliruan yang sedang diperbaiki. Kolomnya memang
-- identitas publik: nama, logo, alamat.
drop policy if exists "Anyone can view the hotel being visited" on tenants;
create policy "Anyone can view the hotel being visited"
  on tenants for select
  using (id = current_tenant());
