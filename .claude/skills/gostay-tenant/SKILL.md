---
name: gostay-tenant
description: Menambah hotel baru ke GoStay (tenant + akun SSO Ventera + sesi WhatsApp + seed kamar) dan membuat situs depan single-tenant untuk hotel itu dengan pola KEMA MERBABU. Pakai saat ada hotel baru bergabung, saat menyiapkan landing page hotel, atau saat men-debug "hotel baru tapi datanya tidak muncul". Trigger - "tambah hotel", "onboarding hotel", "bikin landing page hotel", "situs hotel baru", "tenant baru", "hotel tidak muncul di portal".
---

# GoStay — menambah hotel & membuat situs depannya

## Bagian 1 — Onboarding tenant

### Pakai wizard, jangan SQL

`/admin/add-hotel` (platform admin Ventera) → `POST /api/admin/onboard-hotel`.
Satu aksi itu melakukan **tiga hal yang tidak boleh terpisah**:

1. `create_tenant` — RPC service-role. `tenants` tidak bisa di-INSERT dari klien.
2. Mencetak akun **SSO Ventera** untuk nomor staf pertama lewat
   `POST {SSO_VENTERA_PROVISION_URL}/api/admin/users/provision`, lalu memfilekan
   `profiles`-nya sebagai staf hotel itu.
3. Membuat sesi di gateway WhatsApp dengan `session_id` = slug tenant.

Kalau salah satu gagal, endpoint **membatalkan** yang sudah terlanjur dibuat —
hotel setengah jadi tidak pernah tertinggal.

**Membuat tenant dengan `INSERT` melewati langkah 2.** Nomor pemiliknya tidak
akan pernah bisa login, dan tidak ada cara memperbaikinya dari sisi database:
`profiles.id` adalah `uuid_v5(sso_sub, SSO_UUID_NAMESPACE)`
(`api/_lib/identity.ts`), jadi id yang ditebak menghasilkan profil kosong yang
lolos login tapi tidak membawa apa pun.

Payload wizard: `name`, `slug`, `staffFullName`, `staffPhone` (digit saja,
format 62…), `staffEmail` opsional, `botNumber` opsional.

### Pemilik kedua dan seterusnya

Lewat **User Management** (`/users`) di dashboard hotel, peran `admin`. Sejak
migration 041 `admin` punya akses penuh ke hotelnya sendiri lewat
`is_hotel_member()` — bukan hanya baca.

Peran tidak pernah datang dari token SSO. `profiles.role` satu-satunya sumber
kebenaran, dan profil baru selalu lahir sebagai `customer`.

### Kamar fisik itu wajib

Ketersediaan dihitung dari baris **`rooms`**, bukan dari `room_types`. Hotel yang
punya tipe kamar tapi nol kamar akan melaporkan penuh setiap hari — gejala yang
hampir selalu disalahartikan sebagai "portalnya rusak".

### WhatsApp

`/settings/whatsapp` → pindai QR. Mapping `wa_hotel_sessions` baru ditulis
setelah nomor benar-benar terpasang, jadi onboarding yang ditinggalkan tidak
meninggalkan routing hidup. Detail lain: skill `gostay-wa`.

### Verifikasi

```sql
select id, name, slug, is_active from tenants where slug = '<slug>';

select p.full_name, p.phone, p.role, p.is_active
from profiles p join tenants t on t.id = p.tenant_id
where t.slug = '<slug>' and p.role in ('staff','admin');

select rt.slug, rt.base_rate, count(r.id) filter (where r.is_active) as kamar
from tenants t
join room_types rt on rt.tenant_id = t.id
left join rooms r on r.room_type_id = rt.id
where t.slug = '<slug>' group by rt.slug, rt.base_rate;

select session_id, is_active from wa_hotel_sessions where session_id = '<slug>';
```

Lalu — yang paling menentukan — periksa sebagai pengunjung anonim, karena itulah
yang dilihat portal dan situs hotel:

```bash
curl -s "$SUPABASE_URL/rest/v1/room_types?select=name,slug,base_rate" \
  -H "apikey: $ANON_KEY" -H "x-tenant-slug: <slug>" | jq
```

`[]` di sini padahal SQL menemukan baris = masalah RLS / `current_tenant()`,
bukan datanya. Lanjut ke skill `gostay-db`.

## Bagian 2 — Situs depan hotel

### Apa yang boleh dan tidak boleh dibaca situs hotel

Dengan kunci **anon** + header `x-tenant-slug`, sebuah situs single-tenant bisa
membaca:

| Boleh | Lewat |
|---|---|
| Tipe unit aktif, tarif, foto, fasilitas | `room_types` |
| Kamar aktif | `rooms` |
| Ketersediaan pada rentang tanggal | RPC `available_rooms()` |
| Ulasan terbit | `reviews` |
| Menu POS aktif | `pos_products` |

**Tidak** bisa membaca baris `tenants` — nama, alamat, telepon, logo hotel
tertutup untuk anonim (013; 045 hanya melonggarkan untuk tamu yang sudah punya
riwayat di hotel itu). Karena itu naskah merek tinggal di repo situsnya, bukan
di database. Jangan "memperbaiki" ini dengan melonggarkan policy tanpa
pembahasan — itu membuka daftar seluruh hotel platform ke publik.

### Serah-terima pemesanan

Situs hotel **tidak** memproses pembayaran. Ia mengantar tamu ke:

```
{GOSTAY_URL}/portal/rooms/{slug-unit}?hotel={slug-tenant}&checkIn=&checkOut=&guests=
```

Wajib `/portal/rooms/{slug}`, bukan `/portal/book/details` — yang terakhir hanya
membaca `location.state` React Router, yang tidak pernah ada pada navigasi
lintas domain. `PortalRoomDetail` membaca query param.

Kalau suatu saat situs hotel harus melakukan checkout sendiri, itu butuh
**migration RLS baru**: insert booking oleh tamu saat ini mewajibkan
`tenant_id = get_my_tenant()` (`011_tenancy_rls.sql:186`) — profil tamu, bukan
hotel yang sedang dikunjungi. Jangan mulai membangunnya tanpa migration itu
disepakati lebih dulu.

### Template yang sudah ada

`D:\Project\kema-merbabu` — Next.js 15 App Router, Tailwind, server-only
Supabase. Untuk hotel berikutnya, salin dan ganti:

1. `lib/config.ts` — seluruh identitas & naskah merek hotel baru
2. `.env` — `NEXT_PUBLIC_TENANT_SLUG`
3. `app/globals.css` + `tailwind.config.ts` — palet dan pasangan huruf
4. `supabase/seed-kema.sql` — nama tipe unit
5. `package.json` — nama & port dev

Yang **tidak** perlu diubah: `lib/supabase.ts`, `lib/hotel.ts`, `lib/gostay.ts`,
dan komponen `Frame`/`Reveal`. Itu lapisan sambungan, dan ia sama untuk setiap
hotel.

Jangan menyalin desainnya apa adanya. Setiap hotel punya wajah sendiri; yang
diwarisi adalah arsitekturnya.

### Aturan yang dibawa template

- Tarif yang belum ditetapkan tampil **"Tarif menyusul"**, bukan `Rp 0` atau
  tebakan. `room_types.base_rate` NOT NULL, jadi seed SQL-nya menolak jalan
  tanpa tarif dari operator — itu disengaja.
- Bagian ulasan tidak dirender kalau `reviews` kosong. Tidak ada testimoni
  contoh.
- `aggregateRating` tidak masuk JSON-LD kecuali angkanya nyata.
- Repo situs hotel **tidak pernah** memegang `SUPABASE_SERVICE_ROLE_KEY` dan
  tidak pernah menulis ke database.

### Checklist rilis situs hotel

1. Tenant, staf, tipe unit, dan kamar sudah ada (Bagian 1)
2. `curl` anon di atas mengembalikan unit
3. `npm run build` bersih
4. Env di Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_TENANT_SLUG`, `NEXT_PUBLIC_GOSTAY_URL`, `NEXT_PUBLIC_SITE_URL`
5. Klik "Lanjut pesan" dari produksi dan pastikan mendarat di portal GoStay
   dengan tanggal terbawa
6. Project Vercel **terpisah** dari `gostay-app` — `vercel.json` GoStay punya
   `ignoreCommand` yang hanya membangun `main`, dan itu tidak berlaku di sini
