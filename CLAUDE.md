# GoStay — panduan untuk agen AI

Dokumen ini adalah kebenaran operasional per **29 Juli 2026**. Kalau komentar
kode atau dokumen lain bertentangan dengan ini, yang di sini yang benar.
Detail kontrak integrasi: `docs/INTEGRATIONS.md`.

## Stack (yang benar-benar dipakai)

- **Frontend**: Vite + React 18 SPA (`src/`), shadcn/Tailwind, TanStack Query,
  i18n ID/EN (`src/lib/i18n`). BUKAN Next.js.
- **Backend**: Vercel serverless functions di `api/` (plan Hobby, **maksimal 12
  function** — karena itu route digabung: `api/payment/[action].ts`,
  `api/wa/connect.ts` multi-aksi). Helper di `api/_lib/**` (underscore = tidak
  di-deploy sebagai function).
- **Database**: Supabase Postgres + RLS ketat per-tenant. Migration
  `supabase/migrations/001–043`. Server-side pakai fetch PostgREST dengan
  service key (`api/_lib/wa/client.ts`), BUKAN supabase-js.
- **Auth**: SSO Ventera sendiri (OIDC + PKCE, issuer `sso.ventera.ai`, repo
  `sso-ventera`). BUKAN Supabase Auth. `/api/sso/token` menukar code dan
  mencetak JWT kompatibel-Supabase (ditandatangani `SUPABASE_JWT_SECRET`) —
  itulah yang membuat `auth.uid()`/RLS jalan.
- **Hosting**: Vercel. Produksi = project **gostay-app** → `app.gostay.id`.
  `vercel.json` punya `ignoreCommand`: hanya branch `main` yang dibangun.

## WhatsApp — PENTING, sering disalahpahami

WhatsApp dilayani oleh **gateway Baileys milik Ventera sendiri (self-hosted)**.
Di kode/env namanya masih "wa-ventera" (nama historis) — itu BUKAN layanan
pihak ketiga. Source-nya ADA di mesin dev ini: `D:\Project\wa-ventera`
(branch `fix/lid-resolve`); deploy = salin source ke server
`ventera@103.93.162.172:/opt/wa-gostay` (SSH key sudah terpasang) lalu
`sudo docker compose --env-file .env.production -f docker-compose.prod.yml
build app && ... up -d app`. Container: `wa-gostay-app-1`, port 3061 =
`WA_VENTERA_BASE_URL`. Baileys HARUS ≥7.0.0-rc13 — di rc10 kiriman ke akun
yang sudah migrasi LID "sukses" (dapat messageId) tapi tidak pernah tiba.

- GoStay → gateway: `POST /api/sessions` (buat sesi; id = slug tenant),
  `GET /api/sessions/{id}` (status), `GET /api/sessions/{id}/qr` (SSE),
  `DELETE /api/sessions/{id}`, `POST /api/sessions/{id}/send`
  ({to, type:"text", text}). Auth: `Bearer WA_VENTERA_INT_KEY`,
  base `WA_VENTERA_BASE_URL`.
- Gateway → GoStay: `POST /api/wa/inbound`, header
  `x-webhook-secret: WA_WEBHOOK_SECRET`, body `{sessionId, messages[]}`
  (bentuk key Baileys; `remoteJidAlt` opsional).
- Pemetaan sesi↔hotel: tabel `wa_hotel_sessions` (`session_id` = slug tenant;
  webhook hanya melayani `is_active=true`).
- Percakapan: flow buatan hotel (`wa_flows`, builder di
  `/settings/wa-flows`, seleksi di `api/_lib/wa/flow/select.ts` — gerbang
  `requires:'inhouse'` = punya booking `checked_in`) → fallback percakapan
  booking bawaan (`api/_lib/wa/converse.ts`).
- **Jebakan LID**: WhatsApp menyembunyikan nomor sebagian tamu di balik alias
  `@lid`. GoStay memilih alamat kirim lewat `api/_lib/wa/address.ts` (nomor
  pendamping → nomor asli → nomor di CRM). Sisi gateway sudah diperbaiki
  (30 Jul): LID kini alamat yang BENAR dan tidak lagi diturunkan menjadi nomor.
- **Sukses dari `POST /send` BUKAN bukti sampai.** Jawabannya hanya berarti
  stanza ditulis ke socket; WhatsApp menolak beberapa detik kemudian lewat ack
  asinkron. Gateway melaporkannya sebagai `deliveryFailures[]` ke
  `/api/wa/inbound` → dicatat `wa_incidents` (`rejected_by_whatsapp:*`) →
  halaman `/platform/incidents`. `error 463` = privacy token kontak belum
  terbit; gateway mengulang kiriman sekali karena penolakan itu sendiri yang
  memicu penerbitannya.
- **Balasan beberapa pesan datang berjarak ~8 detik.** Cooldown per-kontak di
  gateway; kiriman yang tertahan DIANTRE (FIFO per kontak), tidak dibuang —
  dulu dibuang, dan itu sebabnya pesan ke-2 dan ke-3 tak pernah tiba.

## Pembayaran — riwayatnya menyesatkan

- **Buat invoice**: GoStay memanggil **Xendit LANGSUNG**
  (`api.xendit.co/v2/invoices`, kunci `XENDIT_API_KEY_PRODUCTION` /
  `XENDIT_API_KEY_SANDBOX`). Komentar lama soal "gateway membuat invoice"
  salah — layanan Ventera itu hanya router callback.
- **Settlement**: Xendit → "Xendit Unified Callback Gateway" milik Ventera
  (merutekan berdasar prefix `GOSTAY-` di external_id) → GoStay
  `POST /api/payment/webhook` dengan `x-internal-token` =
  `INTERNAL_TOKEN_PRODUCTION` | `INTERNAL_TOKEN_SANDBOX` (token yang cocok
  menentukan stamp live/test).
- **Saldo hotel**: fee platform **7%** (700 bps, `payment_config`), kredit
  net-of-fee via trigger DB (migration 031/036), tarik saldo = tabel `payouts`.
- **Dua model tagihan** (migration 055, `hotel_payment_config.billing_mode`):
  `commission` (bawaan, potongan 7%) atau `subscription` (0% potongan; hotel
  bayar tarif tetap bulanan ke Ventera lewat transfer, DI LUAR aplikasi —
  dicatat di `hotel_subscription_invoices`). Tarif efektif satu hotel =
  `hotel_fee_bps(tenant)`, dipakai `credit_hotel_balance()`; cerminan TS-nya
  `feeBpsFor()` di `api/_lib/payment/fee.ts` — ubah satu, ubah keduanya.
  Model tagihan TEGAK LURUS dengan live/test, dan hanya super admin yang boleh
  menulisnya (`/platform/hotels/:id`, penagihan di `/platform/subscriptions`).
- **Langganan bisa dibayar online** (056): hotel menekan Bayar di `/saldo` →
  `POST /api/payment/subscription-checkout` (auth JWT hotel) → invoice Xendit
  `external_id = GOSTAY-SUB-<HOTEL>-<YYYYMM>` → callback masuk ke webhook yang
  sama dan menandai `hotel_subscription_invoices` lunas. Jalur ini TIDAK PERNAH
  menulis ke `payments`: uang langganan milik Ventera, dan satu baris di sana
  akan mengkredit saldo hotel sekaligus memotong 7% dari pendapatan Ventera
  sendiri. Lingkungannya `payment_config.subscription_mode` — TERPISAH dari
  `mode` (hanya bisa diubah lewat psql; tabel itu disegel dari tulisan klien).
- **Buku pembayaran langganan** (058): `subscription_payments` append-only;
  `hotel_subscription_invoices.status`/`paid_total` DITURUNKAN darinya oleh
  trigger — jangan pernah menulis `status='paid'` langsung, catat pembayarannya.
  Pola yang sama dengan `balance_ledger`: uang = kejadian, status = ringkasan.
- **Gerbang tunggakan** (058): hotel yang belum bayar **7 hari** setelah jatuh
  tempo kehilangan aplikasi stafnya sampai membayar (`subscription_gate()`,
  `my_subscription_gate()`). Jatuh tempo = `period + subscription_day - 1`, dan
  TIDAK bergeser karena telat. `/saldo` sengaja tetap terbuka — di situ tombol
  bayarnya. Portal tamu dan bot WhatsApp TIDAK digerbang: keduanya melayani
  tamu, bukan hotel. Gerbangnya di lapisan UI (`SubscriptionGate`), sumber
  kebenarannya fungsi DB. Tagihan ditambal `ensure_subscription_invoices()`
  supaya gerbang tidak bergantung pada ingatan operator.

## Peran & RLS

`staff` (satu hotel), `admin` (operator hotel — sejak 041 punya akses hotelnya
sendiri seperti staf), `customer`. Kewenangan lintas-hotel = daftar putih
`platform_admins` + header `x-platform-scope: all` (konsol `/platform/*`).
Cabang tenant policy memakai `is_hotel_member()` (041) — JANGAN tulis
`role = 'staff'` saja: itu regresi yang pernah mengunci admin (PR #69).

## Perintah

- `npm test` — vitest (semua unit; api/_lib punya test per modul)
- `npm run test:balance` — trigger saldo di Postgres lokal throwaway
- `npx playwright test --config playwright.local.config.ts` — UI vs dev server :8080
- `npx playwright test --config playwright.live.config.ts` — E2E vs produksi
- Login uji: `node scripts/e2e-live-setup.mjs` (staff+tamu; sesi via
  sessionStorage `gostay_sso_session`)
- Diagnosa WA: `node scripts/wa-diagnose.mjs`, audit flow:
  `node scripts/wa-flow-audit.mjs`

## Deploy

Merge PR ke `main` → Vercel build otomatis (hanya main). Pre-push hook
"Ventera AI Code Review" berjalan ±1–5 menit — beri timeout longgar pada
`git push`. Migration DB TIDAK otomatis: terapkan manual dengan psql lewat
`SETUP_DB_CONNECTION_STRING` di `.env`.
