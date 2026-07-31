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

## Pembayaran — via Ventera-Nexus (sejak 31 Jul 2026)

Kontrak resmi: repo `PT-VENTERA-AIAGENT/ventera-nexus` → `docs/INTEGRASI.md`.
App code Nexus: `gostay`; merchant = hotel (external_ref = tenant_id).

- **Buat invoice**: `handleCreateInvoice` → Nexus `POST /v1/payments`
  (`api/_lib/payment/nexus.ts`; kunci `NEXUS_API_KEY_SANDBOX|PRODUCTION`).
  Reference `GOSTAY-{HOTEL}-{YYYYMMDD}-{ACAK}`; pemetaan reference→booking di
  tabel `nexus_references` (migration 048) — body request disimpan dan dikirim
  ulang byte-per-byte saat retry (Idempotency-Key Nexus terikat hash body).
- **Settlement**: Nexus → `POST /api/payment/nexus`, tanda tangan
  `X-Nexus-Signature` = HMAC(secret, "{ts}.{raw body}")
  (`NEXUS_SIGNING_SECRET_*`; environment sah = yang secret-nya cocok, header
  tidak dipercaya). Idempoten pada `X-Nexus-Event-Id`
  (`nexus_processed_events`); status tidak pernah mundur.
- **Rekonsiliasi** (yang MENJAMIN; callback hanya percepatan):
  `GET /api/payment/reconcile` — cron Vercel harian (batas plan Hobby; kontrak
  minta 15 menit — kalau naik Pro ganti jadwalnya) + bisa dipicu manual dengan
  `x-internal-token`. Kursor per environment di `nexus_reconcile_state`.
- **Jalur LAMA masih hidup untuk invoice pra-migrasi**: Xendit → gateway
  callback Ventera → `POST /api/payment/webhook` (`x-internal-token` =
  `INTERNAL_TOKEN_*`). Jangan dihapus selama masih ada invoice lama outstanding.
  JANGAN memindahkan URL webhook akun Xendit production ke nexus-webhook tanpa
  rencana: akun Xendit production-nya DIPAKAI BERSAMA GoStay & Nexus.
- **Saldo hotel**: fee platform **7%** (700 bps, `payment_config`), kredit
  net-of-fee via trigger DB (migration 031/036) — jalan untuk gateway `nexus`
  maupun `xendit`; tarik saldo = tabel `payouts`.

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
