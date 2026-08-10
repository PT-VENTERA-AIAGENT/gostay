---
name: gostay-dev
description: Peta arsitektur, konvensi, dan alur kerja repo GoStay (app.gostay.id). Pakai saat menambah halaman/route/endpoint, mengubah service atau hook, menyentuh api/, menjalankan test, atau merilis ke produksi. Trigger - "tambah halaman", "endpoint baru", "kenapa build gagal", "deploy gostay", "jalankan test", "struktur repo ini".
---

# GoStay — cara bekerja di repo ini

Kebenaran operasional lain ada di `CLAUDE.md` (akar repo). Skill ini menambah
**cara mengerjakan**, bukan mengulang daftar fakta.

## Bentuk sistemnya dalam satu paragraf

Satu SPA Vite/React (`src/`) melayani TIGA dunia sekaligus, dipisah oleh route
dan RLS — bukan oleh deployment: **dashboard hotel** (`/dashboard`, `/bookings`,
`/rooms`, …) untuk staf & admin hotel; **konsol platform** (`/platform/*`) untuk
operator Ventera; dan **portal tamu** (`/portal/*`) yang publik tanpa login.
Backend-nya tipis: fungsi serverless di `api/` hanya untuk hal yang tidak boleh
dikerjakan browser (tukar kode SSO, invoice Xendit, webhook WA). Sisanya browser
bicara langsung ke PostgREST Supabase, dan **RLS-lah otorisasinya**.

Konsekuensi yang sering dilupakan: kalau sebuah halaman "kosong padahal datanya
ada", tersangka pertama adalah policy RLS, bukan query React.

## Peta direktori

| Jalur | Isi |
|---|---|
| `src/pages/` | Satu file per route. Subfolder `platform/`, `portal/`, `settings/`, `admin/`. |
| `src/services/` | Semua query Supabase. **Komponen tidak memanggil `supabase` langsung.** |
| `src/hooks/` | Pembungkus TanStack Query di atas service (`useRooms`, `useTenant`, …). |
| `src/lib/` | Murni: i18n, format, slug tenant, klien Supabase, logika tanpa React. |
| `src/components/` | shadcn/ui di `ui/`, sisanya per-domain. |
| `api/*.ts` | Fungsi Vercel. **Maksimum 12 di seluruh repo.** |
| `api/_lib/**` | Helper — underscore artinya tidak ikut dihitung sebagai function. |
| `supabase/migrations/` | Bernomor, append-only. Lihat skill `gostay-db`. |

## Tiga klien Supabase, jangan tertukar

Di `src/lib/supabase.ts`:

- `supabase` — default. Mengirim `x-tenant-slug`, token SSO. **Pakai ini di mana
  pun kecuali halaman `/platform/*`.**
- `platformDb` — mengirim `x-platform-scope: all`. Hanya dipakai
  `platformService.ts`. Header ini tidak memberi hak apa pun; ia hanya memilih
  cabang policy yang sudah di-AND dengan allowlist `platform_admins`.
- Di `api/`: **bukan supabase-js sama sekali** — `api/_lib/wa/client.ts`
  (`serviceGet` / `serviceInsert` / `serviceUpdate`) yang mem-fetch PostgREST
  dengan service key.

Memakai `platformDb` di halaman hotel adalah bug yang pernah terjadi: dua akun
hotel berbeda melihat inbox yang sama.

## Batas 12 function — cara menambah endpoint

Vercel Hobby menolak deploy pada function ke-13. Jadi **jangan menambah file di
`api/`**. Gabungkan ke route dinamis yang sudah ada:

- Urusan pembayaran → aksi baru di `api/payment/[action].ts`
- Urusan suara → `api/voice/[action].ts`
- Urusan WhatsApp (selain webhook masuk) → `api/wa/connect.ts`

Kalau benar-benar butuh keluarga endpoint baru, buat SATU file `[action].ts` dan
dispatch di dalamnya. Hitung dulu: `ls api/**/*.ts` yang bukan di `_lib/`.

## Menambah halaman baru — urutan yang benar

1. Fungsi query di `src/services/<domain>Service.ts` (murni, mengembalikan data,
   melempar error apa adanya).
2. Hook di `src/hooks/` yang membungkusnya dengan `useQuery` + `queryKey` stabil.
3. Halaman di `src/pages/`, komponen presentasional saja.
4. Route di `src/App.tsx` — perhatikan ia harus masuk grup yang benar
   (`ProtectedRoute`, grup platform, atau `/portal` yang publik).
5. Teks user-facing lewat `useT()` (`src/lib/i18n`). Bahasa dasar Indonesia.
6. Kalau menyentuh tabel baru: **policy RLS-nya wajib ada di migration**, kalau
   tidak halaman itu kosong untuk semua orang kecuali service role.

## Test

```
npm test                                                   # vitest, semua unit
npm run test:balance                                       # trigger saldo, Postgres throwaway
npx playwright test --config playwright.local.config.ts    # UI vs dev server :8080
npx playwright test --config playwright.live.config.ts     # E2E vs produksi
node scripts/e2e-live-setup.mjs                            # bikin login uji (staff + tamu)
```

Logika murni (perhitungan malam, status kamar, graf flow WA, normalisasi nomor)
punya test unit di sebelah filenya — `nights.test.ts`, `roomStatus.test.ts`,
`waFlowGraph.test.ts`. Kalau menambah logika sejenis, tambahkan test sebelah.
Yang tidak diuji unit: komponen React (pakai Playwright).

## Rilis

Merge PR ke `main` → Vercel build otomatis. `vercel.json` punya `ignoreCommand`
yang membatalkan build untuk branch selain `main`, jadi preview deploy memang
tidak ada — itu disengaja.

Pre-push hook "Ventera AI Code Review" jalan 1–5 menit. **Beri `git push` timeout
longgar** (≥ 600000 ms), jangan dibunuh di tengah jalan.

Migration DB **tidak** ikut otomatis. Terapkan manual — lihat skill `gostay-db`.

## Jebakan yang sudah pernah memakan korban

- **Bundle-init throw.** `createClient` melempar kalau URL kosong, dan itu
  terjadi sebelum React mount — seluruh app putih, ErrorBoundary tidak kebagian.
  Karena itu ada fallback placeholder di `src/lib/supabase.ts`. Jangan dihapus.
- **`role = 'staff'` di policy.** Regresi PR #69 yang mengunci admin dari
  hotelnya sendiri. Pakai `is_hotel_member()`.
- **`location.state` untuk handoff.** `/portal/book/details` hanya membaca
  `location.state`, jadi tautan dari luar aplikasi tidak bisa mendarat di sana.
  Titik masuk lintas-domain yang benar adalah
  `/portal/rooms/{slug}?hotel={slug-hotel}&checkIn=&checkOut=&guests=` —
  `PortalRoomDetail` membaca query param.
- **Sukses `POST /send` WhatsApp bukan bukti sampai.** Lihat skill `gostay-wa`.

## Kapan pindah ke skill lain

- Menulis migration, policy RLS, atau debugging "data tidak terlihat" → `gostay-db`
- Pesan WA tidak sampai, LID, QR, gateway → `gostay-wa`
- Menambah hotel baru atau membuat landing page hotel → `gostay-tenant`
