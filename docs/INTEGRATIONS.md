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
dan konsol platform `/platform/incidents`.

### Bukti sampai: ack, bukan jawaban HTTP (diperbaiki 30 Jul 2026)

Jawaban `POST /send` hanya berarti stanza ditulis ke socket. Penolakan WhatsApp
datang beberapa detik kemudian lewat ack asinkron, dan dulu berhenti di log
server — itulah yang membuat balasan hilang berhari-hari tanpa jejak. Sekarang:

- Gateway mengirim `deliveryFailures[]` ke `POST /api/wa/inbound` (endpoint yang
  sama, kunci baru — konsumer yang hanya membaca `messages[]` tak terpengaruh).
  GoStay mencatatnya di `wa_incidents` dengan reason `rejected_by_whatsapp:*`.
- `error 463` = privacy token kontak belum terbit. Token itu diterbitkan **oleh
  penerima**, dan penolakan 463 itu sendiri yang memicu penerbitannya — jadi
  gateway mengulang kiriman **sekali**. Gagal kedua dilaporkan, tidak diulang
  lagi (mengulang terus dihitung WhatsApp sebagai reach-out berulang).
- Alamat yang benar sekarang **LID**, bukan nomor: ack pengiriman yang berhasil
  datang di alamat `@lid`. Penerjemahan LID→nomor (benar di Baileys rc10) sudah
  dibalik.
- Baileys gateway HARUS ≥ 7.0.0-rc13, dan history sync TIDAK boleh dimatikan —
  paket sync itu yang membawa pemetaan LID; tanpanya WhatsApp menolak semua
  kiriman dengan 463.
- Balasan yang terdiri dari beberapa pesan tiba berjarak ~8 detik: cooldown
  per-kontak, dan kiriman yang tertahan **diantre** (FIFO per kontak, 3
  percobaan), tidak dibuang. Pola ini menyamai antrean BullMQ milik `Chatly`,
  yang memakai cooldown 8 detik yang sama tanpa pernah kehilangan pesan.

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
  (override URL uji: `XENDIT_API_URL`).
- **`external_id = GOSTAY-<HOTEL>-<referensi>`**, mis.
  `GOSTAY-LOR-KALI-BK-20260730-D39D`. Dua syarat yang harus benar sekaligus:
  awalan `GOSTAY-` TIDAK boleh bergeser (router callback memilih tujuan dari
  situ), dan nama hotel ada supaya satu ledger Xendit yang melayani banyak hotel
  masih bisa dibaca manusia. Pembacaan baliknya
  (`referenceFromExternalId`) mencari `BK-` **terakhir**, jadi (a) invoice lama
  berbentuk `GOSTAY-<referensi>` tetap terbaca — kalau ini regresi, tamu bayar
  dan settlement-nya tak pernah menemukan booking-nya — dan (b) hotel yang
  namanya sendiri memuat "BK-" tidak membuatnya salah baca.
- **Settlement**: Xendit memanggil SATU callback URL global → **"Xendit
  Unified Callback Gateway"** milik Ventera → merutekan berdasar prefix
  `GOSTAY-` → `POST {app}/api/payment/webhook` dengan header
  `x-internal-token` = `INTERNAL_TOKEN_PRODUCTION` | `INTERNAL_TOKEN_SANDBOX`.
  Token mana yang cocok menentukan stamp `live`/`test` — sandbox tak pernah
  bisa tercatat live. Idempoten via UNIQUE `payments.gateway_ref`.
- **Mode per hotel**: `hotel_payment_config` (live/test/off), default global di
  `payment_config`. `is_active=false` MEMAKSA `test` — sebuah hotel tidak bisa
  bertransaksi live karena kelalaian.
- **Model tagihan per hotel** (migration 055, kolom di tabel yang sama):
  `billing_mode` = `commission` (bawaan, potongan 7%) atau `subscription`
  (0% potongan; hotel bayar tarif tetap bulanan ke Ventera lewat transfer, di
  LUAR aplikasi). Tegak lurus dengan live/test: hotel langganan tetap boleh
  menerima pembayaran Xendit live. Diatur super admin di
  `/platform/hotels/:id`; penagihannya di `/platform/subscriptions`. Menulis
  kolom ini kewenangan platform saja — hotel yang bisa menulisnya bisa
  menihilkan fee-nya sendiri.
- **Lunas → reservasi terkonfirmasi**: trigger `recompute_booking_payment`
  (migration 019, diperluas 044) menaikkan `bookings.status` dari `pending` ke
  `confirmed` begitu `payment_status` jadi `paid`. Hanya MAJU — reservasi yang
  sudah `checked_in`/`cancelled` tidak pernah ditarik kembali. Sebelum 044
  statusnya tertinggal `pending` walau uang sudah masuk, dan bot WhatsApp
  menjanjikan konfirmasi otomatis yang tak ada kodenya.

### Naik ke produksi (live)

Terbukti jalan end-to-end di sandbox 30 Jul 2026: invoice → bayar → callback →
`payments` → fee 7% → `hotel_balance` → reservasi `confirmed`. Untuk live:

1. `XENDIT_API_KEY_PRODUCTION` dan `INTERNAL_TOKEN_PRODUCTION` terisi di Vercel
   (sudah). Jangan tertukar: token mana yang cocok itulah yang menentukan stamp
   `live`/`test`, jadi token salah = pembayaran live tercatat sebagai test.
2. Router callback Ventera harus melayani prefix `GOSTAY-` untuk akun Xendit
   **produksi**, bukan hanya sandbox. Ini SATU-SATUNYA bagian yang belum pernah
   diuji live; kalau terlewat, tamu membayar dan reservasinya tetap menunggu.
3. Di Xendit produksi, callback URL invoice mengarah ke router Ventera itu.
4. Baru setelah 1–3: `hotel_payment_config.mode = 'live'` untuk hotel yang
   dituju (dan `payment_config.mode` bila ingin default global live).
5. Uji dengan nominal kecil pada satu hotel dulu, lalu periksa `payments.payment_env
   = 'live'` dan `balance_ledger` bertambah net-of-fee.

## 3. Saldo hotel & tarik saldo

Setiap baris `payments` memicu trigger DB (migration 031, diperbarui 055):
kredit `hotel_balance` **net setelah fee platform** — tarifnya dari
`hotel_fee_bps(tenant)`, yaitu `payment_config.platform_fee_bps = 700` (7%,
migration 036) untuk hotel `commission` dan **0 untuk hotel `subscription`**,
tercatat di `balance_ledger` beserta `fee_bps` yang berlaku saat itu. Karena
tarifnya tercatat per baris, refund membalik jumlah yang DULU diambil, bukan
menghitung ulang dengan tarif hari ini. Tarik saldo = insert `payouts` (trigger
menahan dana atomik; saldo kurang = ditolak DB). Proses setujui/tolak =
kewenangan platform. UI hotel: `/saldo`; konsol: `/platform/balances`.

Tagihan langganan bulanan (`hotel_subscription_invoices`, 055) BUKAN bagian dari
saldo: uangnya tidak pernah lewat GoStay. Satu baris per hotel per bulan
(periode dinormalkan ke tanggal 1, UNIQUE per hotel), diterbitkan dan ditandai
lunas oleh operator di `/platform/subscriptions` setelah transfer diterima.

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
- Log jawaban AI lintas hotel: `ai_reply_logs` (050) → `/platform/ai-logs`.

## 5b. Model AI — satu pintu, rantai failover

- **Semua** pemanggil chat-completions lewat `api/_lib/ai/chat.ts`: ekstraksi
  niat booking (`api/_lib/wa/ai.ts`), concierge tamu (`api/_lib/wa/concierge.ts`),
  dan penulis pesan outbound (`api/_lib/outbound/{generate,converse}.ts`).
- Vendor ditentukan env, bukan kode: `AI_CHAT_PROVIDER` = daftar berurut yang
  dicoba kiri→kanan (`nous,openai` = Nous dulu, jatuh ke OpenAI bila gagal).
  Provider yang API key-nya kosong dilewati, jadi key vendor non-aktif boleh
  tetap tersimpan. Kosong = `openai`, yaitu perilaku sebelum rantai ini ada.
- **Voice AI TIDAK ikut**: `api/_lib/voice/handlers.ts` memakai Realtime API
  OpenAI (`/v1/realtime/client_secrets`) yang tidak punya padanan di vendor
  lain — ia selalu butuh `OPENAI_API_KEY`.
- Outbound tetap ditulis model kelas Claude lewat `OUTBOUND_MODELS`
  (`~anthropic/claude-sonnet-latest` di Nous). SDK `@anthropic-ai/sdk` sudah
  tidak dipakai kode mana pun.
- Concierge punya **lapis ke-4**: `api/_lib/wa/number-guard.ts` mencocokkan
  setiap angka berkonsekuensi di jawaban (tarif, persen, durasi, jumlah) dengan
  angka yang benar-benar dikembalikan tool — per satuan, bukan global. Tidak
  cocok = jawaban diganti `SAFE_FALLBACK`, perlakuan yang sama dengan kebocoran
  nomor telepon.

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
