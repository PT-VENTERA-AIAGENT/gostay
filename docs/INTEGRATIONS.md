# Integrasi GoStay — kontrak as-built

**Per 29 Juli 2026.** Dokumen ini menggambarkan apa yang KODE lakukan hari ini,
bukan rencana. Kalau komentar kode bertentangan, dokumen ini yang benar.
Ringkasan untuk agen AI: `CLAUDE.md` di root repo.

## 1. WhatsApp — gateway Baileys milik sendiri

WhatsApp TIDAK ditangani di dalam repo ini dan BUKAN layanan pihak ketiga.
Ia adalah **service Baileys self-hosted milik Ventera** (di kode/env masih
bernama historis "wa-ventera"; source-nya di luar org GitHub ini). GoStay
berbicara dengannya lewat kontrak HTTP kecil:

### GoStay → gateway (`api/_lib/wa/gateway.ts`, `send.ts`)

| Aksi | Endpoint | Catatan |
|---|---|---|
| Buat/start sesi | `POST {base}/api/sessions` `{id, label}` | `id` = slug tenant; idempoten |
| Status sesi | `GET {base}/api/sessions/{id}` | "open"/"connecting"/… + connected, number |
| QR pairing | `GET {base}/api/sessions/{id}/qr` | SSE; event `qr` + status |
| Putuskan | `DELETE {base}/api/sessions/{id}` | logout |
| Kirim teks | `POST {base}/api/sessions/{id}/send` `{to, type:"text", text}` | `to` = JID atau digit |

Auth semua panggilan: `Authorization: Bearer {WA_VENTERA_INT_KEY}`.
Base URL: `WA_VENTERA_BASE_URL`. Keduanya hanya ada di env Vercel.

### Gateway → GoStay (inbound)

`POST {app}/api/wa/inbound`, header `x-webhook-secret: WA_WEBHOOK_SECRET`.
Body: `{sessionId, messages: [{key:{remoteJid, remoteJidAlt?, id, fromMe},
pushName?, message:{conversation | extendedTextMessage.text},
messageTimestamp, category?}]}` — bentuk key Baileys apa adanya.

Resolusi tenant: `wa_hotel_sessions.session_id = sessionId` dan **hanya**
baris `is_active=true` yang dilayani.

### Alamat balasan & jebakan LID (`api/_lib/wa/address.ts`)

WhatsApp menyembunyikan nomor sebagian tamu di balik alias `@lid`. Gateway
versi sekarang **menjawab 200 untuk kiriman ke `@lid` lalu pesannya dibuang
WhatsApp** — sukses palsu. Karena itu GoStay memutuskan alamat SEBELUM kirim:

1. `remoteJidAlt` (nomor pendamping dari WhatsApp), bila ada;
2. alamat asal bila memang nomor (`@s.whatsapp.net`);
3. nomor asli yang diisi hotel di CRM (`customers.phone`) — angka LID yang
   tersimpan sebagai phone dikenali dan ditolak;
4. sisanya: tetap dicoba, ditandai `unroutable`, dan **insiden dicatat meski
   gateway menjawab sukses** (`wa_incidents`, reason
   `unroutable_lid:gateway_reported_ok`).

Kegagalan tampil di: strip peringatan di inbox (`/chat`), toast balasan staf,
dan konsol platform `/platform/incidents`. Patch yang harus diterapkan DI
GATEWAY (resolve `getPNForLID()` + jangan jawab 200 palsu):
`docs/wa-ventera-lid-fix.md`. Referensi implementasi ada di repo `Chatly`
(`workers/wa-inbound.handler.ts`, `jidToContactId`).

### Lapisan percakapan (urutan penanganan pesan)

1. Bot dijeda? (`chat_threads.bot_paused_until`, takeover staf) → diam.
2. **Flow hotel** (`wa_flows`; builder `/settings/wa-flows`;
   `api/_lib/wa/flow/`): seleksi kata kunci bertingkat + gerbang
   `requires:'inhouse'` (= punya booking `checked_in`). Flow bergerbang yang
   cocok tapi tamu belum memenuhi → balasan penjelasan (bukan dilompati).
   Tamu terparkir di node pilihan yang mengetik kata milik flow lain →
   berpindah flow (node `ask` tidak pernah dicuri).
3. Fallback percakapan bawaan (`converse.ts`): booking, room service,
   ketersediaan, concierge AI, dsb.

## 2. Pembayaran — Xendit langsung + router callback

**Riwayat yang menyesatkan**: dulu kode percaya "gateway Ventera membuat
invoice". Salah — layanan itu hanya router callback. Sejak commit `3172def`:

- **Buat invoice**: GoStay → `POST https://api.xendit.co/v2/invoices`
  langsung. Kunci: `XENDIT_API_KEY_PRODUCTION` / `XENDIT_API_KEY_SANDBOX`
  (override URL uji: `XENDIT_API_URL`). `external_id = GOSTAY-<referensi>`.
- **Settlement**: Xendit memanggil SATU callback URL global → **"Xendit
  Unified Callback Gateway"** milik Ventera → merutekan berdasar prefix
  `GOSTAY-` → `POST {app}/api/payment/webhook` dengan header
  `x-internal-token` = `INTERNAL_TOKEN_PRODUCTION` | `INTERNAL_TOKEN_SANDBOX`.
  Token mana yang cocok menentukan stamp `live`/`test` — sandbox tak pernah
  bisa tercatat live. Idempoten via UNIQUE `payments.gateway_ref`.
- **Mode per hotel**: `hotel_payment_config` (live/test/off), default global di
  `payment_config`.

## 3. Saldo hotel & tarik saldo

Setiap baris `payments` memicu trigger DB (migration 031): kredit
`hotel_balance` **net setelah fee platform 7%** (`payment_config.platform_fee_bps
= 700`, migration 036), tercatat di `balance_ledger`. Tarik saldo = insert
`payouts` (trigger menahan dana atomik; saldo kurang = ditolak DB). Proses
setujui/tolak = kewenangan platform. UI hotel: `/saldo`; konsol:
`/platform/balances`.

## 4. SSO & identitas

- Issuer: `https://sso.ventera.ai` (service sendiri, repo `sso-ventera`).
  OIDC + PKCE dari SPA (`src/lib/sso.ts`).
- `/api/sso/token` menukar code, lalu **mencetak JWT kompatibel-Supabase**
  (HS256, `SUPABASE_JWT_SECRET`, `sub` = profiles.id) — supabase-js
  menyajikannya via hook `accessToken`, sehingga `auth.uid()` dan RLS bekerja.
  Supabase Auth TIDAK dipakai.
- Tamu WhatsApp diprovisikan otomatis (`api/_lib/wa/guest.ts`): profil +
  customer per hotel; nama akun WA disimpan terpisah di
  `customers.wa_push_name` (042) — `full_name` adalah nama reservasi.

## 5. Peran, tenancy, konsol platform

- Peran: `staff`, `admin`, `customer`. Sejak **041**: cabang tenant di policy
  memakai `is_hotel_member()` (staff ATAU admin) — admin bekerja di hotelnya
  sendiri seperti staf. Jangan pernah menulis policy `role='staff'` saja.
- Lintas hotel: daftar putih `platform_admins` + header `x-platform-scope:
  all` (`platform_admin_scope()`, migration 035). Klien khususnya `platformDb`
  (`src/lib/supabase.ts`); halaman `/platform/*`.
- Insiden WA lintas hotel: `wa_incidents` (043) → `/platform/incidents`.

## 6. Hosting & deploy

- Vercel, plan Hobby. Produksi: project **gostay-app** → `app.gostay.id`.
  (Dua project lain yang tertaut repo ini — `gostay-dev`,
  `bookme-hotel-done` — sebaiknya diputus dari Git di dashboard.)
- `vercel.json` `ignoreCommand`: hanya `main` yang dibangun.
- Batas 12 function → route digabung per-aksi (`api/payment/[action].ts`;
  `api/wa/connect.ts` dengan `?action=reset-chat|reply|restore`).
- Migration DB manual: `psql "$SETUP_DB_CONNECTION_STRING" -f supabase/migrations/xxx.sql`.

## 7. Variabel lingkungan (nama historis dipertahankan)

| Nama | Dipakai untuk |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | klien browser |
| `SUPABASE_SERVICE_ROLE_KEY` | server (PostgREST, lewati RLS) |
| `SUPABASE_JWT_SECRET` | mencetak & memverifikasi JWT sesi |
| `SSO_ISSUER`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET` | tukar code OIDC (server) |
| `WA_VENTERA_BASE_URL`, `WA_VENTERA_INT_KEY` | gateway Baileys sendiri |
| `WA_WEBHOOK_SECRET` | verifikasi inbound WA |
| `XENDIT_API_KEY_PRODUCTION`, `XENDIT_API_KEY_SANDBOX` | buat invoice |
| `INTERNAL_TOKEN_PRODUCTION`, `INTERNAL_TOKEN_SANDBOX` | verifikasi webhook settlement |
| `APP_PUBLIC_URL` | tautan portal di balasan WA |
