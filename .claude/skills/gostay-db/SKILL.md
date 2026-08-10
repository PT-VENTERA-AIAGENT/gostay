---
name: gostay-db
description: Menulis dan menerapkan migration Supabase GoStay serta policy RLS multi-tenant. Pakai saat menambah tabel/kolom, mengubah hak akses, atau menyelidiki "data ada di DB tapi tidak muncul di aplikasi". Trigger - "bikin migration", "RLS", "policy", "tabel baru", "kolom baru", "403 dari PostgREST", "halaman kosong padahal ada datanya", "apply migration".
---

# GoStay — migration & RLS

## Model tenancy dalam satu kalimat

Satu tenant = satu hotel; setiap staf dan setiap tamu tinggal di dalam satu
tenant; tidak ada yang milik dua. Semua tabel operasional punya `tenant_id`, dan
**setiap predikat policy adalah satu perbandingan kesetaraan**.

## Empat fungsi yang jadi tulang punggung setiap policy

| Fungsi | Menjawab | Catatan |
|---|---|---|
| `get_my_role()` | peran pemanggil | SECURITY DEFINER, `search_path` dipatok |
| `get_my_tenant()` | hotel **milik** pemanggil (dari `profiles`) | otoritatif, tak bisa dipalsu |
| `current_tenant()` | hotel yang **sedang dilihat** | staf/admin → `get_my_tenant()`; tamu/anonim → header `x-tenant-slug` |
| `is_hotel_member()` | `role in ('staff','admin')` | **pakai ini**, jangan `role = 'staff'` |

Ditambah `platform_admin_scope()` = `is_platform_admin() AND header
x-platform-scope: all`. Header tidak pernah memberi hak; ia memilih cabang.

Perbedaan `get_my_tenant()` vs `current_tenant()` adalah batas keamanan, bukan
gaya. `current_tenant()` boleh digerakkan header browser karena ia hanya memilih
di antara data yang memang publik (tipe kamar aktif, tarif, ulasan terbit, menu).
`get_my_tenant()` tidak boleh, karena ia menjaga data operasional.

## Bentuk baku sebuah policy

```sql
-- baca+tulis oleh anggota hotel, plus operator platform
create policy <tabel>_access on public.<tabel> for all to authenticated
  using      (public.platform_admin_scope()
              or (public.is_hotel_member() and tenant_id = public.get_my_tenant()))
  with check (public.platform_admin_scope()
              or (public.is_hotel_member() and tenant_id = public.get_my_tenant()));
```

Untuk data yang harus terbaca portal publik (brosur hotel):

```sql
create policy <tabel>_public_read on public.<tabel> for select to anon, authenticated
  using (is_active and tenant_id = public.current_tenant());
```

## Aturan yang tidak boleh dilanggar

1. **Jangan pernah menulis `get_my_role() = 'staff'` sendirian.** Itu regresi
   PR #69: admin terkunci dari hotelnya sendiri. `is_hotel_member()`.
2. **Uniqueness harus per-tenant.** `unique (tenant_id, <kolom>)`, bukan
   `unique (<kolom>)`. Dua hotel boleh sama-sama punya kamar "101" dan slug
   "deluxe". Pengecualian sadar: `bookings.reference` tetap unik global karena
   dibacakan tamu lewat telepon.
3. **Setiap `tenant_id` butuh index.** Semua predikat policy memfilternya;
   tanpa index setiap policy jadi sequential scan.
4. **Tabel baru = policy baru di migration yang sama.** RLS menyala tapi tanpa
   policy berarti nol baris untuk semua orang kecuali service role — dan
   gejalanya adalah halaman kosong tanpa error.
5. **Kolom yang dimiliki operator harus dijaga trigger**, bukan hanya policy.
   Pola `guard_tenant_privileged_columns()` (022): `is_privileged_context()`
   lolos, sisanya ditolak kalau menyentuh `slug` / `is_active` / `id`.
6. **Fungsi SECURITY DEFINER wajib `set search_path = public, pg_temp`.** Tanpa
   itu pemanggil bisa membayangi tabel dengan temp table dan memilih jawabannya
   sendiri.
7. **Jangan longgarkan policy untuk memperbaiki gejala.** Kalau pembacaan
   anonim butuh join ke tabel privat, buat fungsi SECURITY DEFINER yang hanya
   mengembalikan fakta yang boleh keluar — persis seperti `available_rooms()`
   (009) yang menjawab "kamar ini kosong" tanpa membocorkan siapa yang menginap.

## Menulis migration baru

Nomor berikutnya = `ls supabase/migrations | tail -1` + 1. **Append-only**:
jangan mengedit migration yang sudah diterapkan di produksi.

Kerangka:

```sql
-- <NNN>_<nama_singkat>.sql
-- Satu paragraf: MASALAH apa yang ada sebelum ini, dan kenapa perbaikannya
-- berbentuk seperti ini. Gaya komentar di repo ini menjelaskan sebab, bukan
-- mengulang isi SQL-nya.

alter table <tabel> add column if not exists <kolom> <tipe>;
create index if not exists idx_<tabel>_<kolom> on <tabel> (<kolom>);

drop policy if exists <nama> on <tabel>;
create policy <nama> on <tabel> ...;
```

Idempoten sepanjang bisa (`if not exists`, `drop policy if exists` sebelum
`create policy`) — migration di sini kadang dijalankan ulang.

Kalau migration memindahkan skema DAN mengubah RLS, boleh dipecah dua file
(pola 010 + 011), tapi keduanya **harus dirilis bersamaan** — di antaranya
database sadar-tenant tapi belum menegakkan tenant.

## Menerapkan migration

Tidak otomatis. Manual dengan psql memakai `SETUP_DB_CONNECTION_STRING` di
`.env`:

```bash
psql "$SETUP_DB_CONNECTION_STRING" -v ON_ERROR_STOP=1 -f supabase/migrations/0NN_nama.sql
```

Jalankan di transaksi kalau ada beberapa file. Setelah selesai, verifikasi
policy-nya benar-benar ada:

```sql
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
from pg_policy where polrelid = 'public.<tabel>'::regclass;
```

## Mendiagnosa "datanya ada tapi tidak muncul"

Urutan yang paling cepat menemukan penyebabnya:

1. **Siapa pemanggilnya?** `select auth.uid(), get_my_role(), get_my_tenant(), current_tenant();`
   Kalau `auth.uid()` NULL padahal sudah login → masalahnya token SSO, bukan RLS
   (`SUPABASE_JWT_SECRET` tidak cocok).
2. **Barisnya tenant siapa?** `select tenant_id from <tabel> where id = '…';`
   Bandingkan dengan langkah 1.
3. **Policy-nya mana yang lolos?** Jalankan query yang sama sebagai service role
   (bypass RLS). Kalau service role melihatnya dan pemanggil tidak, itu RLS.
4. **Header terkirim?** Untuk bacaan anonim portal, `x-tenant-slug` harus ada.
   Tanpa header dan lebih dari satu tenant aktif, `current_tenant()` menolak
   menebak dan mengembalikan NULL — sengaja.

## Trigger saldo

`npm run test:balance` menjalankan trigger kredit saldo (031/036, fee platform
7% = 700 bps di `payment_config`) di Postgres lokal sekali pakai. Jalankan ini
setiap kali menyentuh `payments`, `hotel_balance`, atau `payouts`.
