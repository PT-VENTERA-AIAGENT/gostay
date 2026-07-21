# Plan: WhatsApp AI Booking — GoStay

> Tamu chat ke nomor WA milik sebuah hotel → AI (`gpt-4o-mini`, house-style) melayani
> percakapan booking → daftarkan tamu (akun SSO penuh via Ventera, **opsi B**) →
> buat booking `pending` di tenant hotel yang benar → staff hotel konfirmasi di dashboard.

Status riset: **SELESAI** (4 repo terverifikasi). Plan ini siap dieksekusi per fase di
konteks chat terpisah. Setiap fase mandiri: bawa referensi dokumentasinya sendiri.

---

## Arsitektur

```
Tamu WA ──▶ nomor WA Hotel X (1 nomor = 1 sessionId)
                │
   wa-ventera (Baileys, D:\Project\wa-ventera — TIDAK diubah)
     forwardIncoming(): POST { sessionId, receivedAt, messages[] }
     header x-webhook-secret   (route via WEBHOOK_ROUTES per-session)
                │
                ▼
   GoStay: api/wa/inbound.ts   ← VERCEL NODE FUNCTION (bukan Deno edge!)
     1. verifikasi x-webhook-secret
     2. idempotency insert wa_inbound_messages (unique wa_message_id)
     3. sessionId ──▶ wa_hotel_sessions ──▶ tenant_id   (kalau tak ada: 200 diam)
     4. sender phone ──▶ wa_guest_identities  (resolve / provision)
     5. AI gpt-4o-mini ekstraksi intent + slot (tanggal, kamar, tamu)
     6. confirm-before-write: simpan wa_pending_actions, balas ringkasan + "YA/BATAL"
     7. balas "YA" ──▶ tulis booking (service_role, tenant_id EKSPLISIT), status pending
                │
     ├─ provision tamu (opsi B): Ventera /provision (phone) ─▶ sub
     │    profileIdFor(sub) ─▶ profiles + customers (service_role, tenant eksplisit)
     ├─ balasan keluar: POST wa-ventera /api/sessions/<sessionId>/send  (Bearer int_*)
                │
                ▼
   Staff Hotel X di dashboard (RLS ─▶ hanya Hotel X) ─▶ confirm ─▶ ✅
```

## Peta dependensi lintas-repo

| Repo | Peran | Perubahan | Blok fase |
|---|---|---|---|
| **sso-ventera** (`D:\Project\sso-ventera`) | IdP OIDC | **Tambah 1 route provision + register client `gostay`** | Fase 1 → blok Fase 4 |
| **wa-ventera** (`D:\Project\wa-ventera`) | Gateway WA | **TANPA kode** — hanya konfig `WEBHOOK_ROUTES` + QR per hotel | Fase 6 (operasional) |
| **gostay** (`d:\Project\gostay`) | App utama | Migrasi DB + `api/wa/*` + `api/_lib/wa/*` | Fase 2–6 |

Urutan eksekusi: **Fase 1 (Ventera) dan Fase 2 (DB) bisa paralel** → Fase 3 → Fase 4 (butuh Fase 1 & 2) → Fase 5 → Fase 6.

---

## Fase 0 — Allowed APIs & Pola (konsolidasi riset)

**Runtime GoStay** — Vercel Node functions di `api/`, BUKAN Supabase edge (Deno).
Tidak ada `supabase/functions/` di repo. Webhook WA = fungsi Node, boleh `node:crypto`.
Bukti: `api/sso/token.ts`, `api/_lib/exchange.ts`, `api/_lib/provision.ts`, `api/_lib/identity.ts`.

**Helper GoStay yang WAJIB di-reuse (jangan tulis ulang):**
- `profileIdFor(ssoSub)` → `api/_lib/identity.ts:46` — `profiles.id = uuidV5(sub, ns)`. Deterministik.
- `provisionProfile(input)` → `api/_lib/provision.ts:72` — INSERT profil service-role, tenant eksplisit, role default `customer`. **Perlu varian yang terima `tenantId` langsung** (lihat Fase 4).
- `mintSupabaseToken(...)` → `api/_lib/identity.ts:92` — TIDAK dipakai bot (bot tak butuh sesi); relevan hanya bila nanti mau kasih token portal ke tamu.
- `config()` pola env lazy → `api/_lib/provision.ts:30` & `exchange.ts:16`.

**Kontrak wa-ventera (dari `D:\Project\wa-ventera`, jangan diubah):**
- Inbound: `src/lib/wa/webhook.ts` `forwardIncoming()` → POST body
  `{ sessionId: string, receivedAt: ISOString, messages: WAMessage[] }`, header `x-webhook-secret`.
  - Hotel = `sessionId` (nomor tujuan TIDAK dikirim terpisah).
  - Sender = `messages[i].key.remoteJid`; **skip** `messages[i].key.fromMe === true`.
  - Teks: `messages[i].message.conversation` ?? `messages[i].message.extendedTextMessage.text`.
  - Media inline: `mediaKind` / `mediaBase64` / `mediaMimetype` (untuk fase lanjutan; MVP teks saja).
- Routing: env `WEBHOOK_ROUTES=[{"sessionId","url","secret"}]` (`src/lib/wa/webhook.ts` `routeForSession()`).
- Outbound: `POST /api/sessions/<sessionId>/send` (`src/app/api/sessions/[id]/send/route.ts`),
  header `Authorization: Bearer int_<...>` ATAU `x-api-token`, body `{ to, type:"text", text }` → `{ ok, to, messageId }`.
  Caller (pemilik integration key) **harus owner/admin** session itu.
- Provisioning nomor: admin `POST /api/sessions {id,label}` → `GET /api/sessions/{id}/qr` (SSE) scan QR. Operasional.

**Kontrak sso-ventera (dari `D:\Project\sso-ventera`):**
- User passwordless: `apps/idp/prisma/schema.prisma` — `@@unique([realmId, phone])`, tanpa password, `phoneVerifiedAt`.
- Primitif create SUDAH ADA: `createUser` Server Action di
  `apps/idp/src/app/admin/(authed)/users/actions.ts` — phone-only, pre-verified.
  **Belum ada endpoint mesin-callable** (hanya di balik cookie admin `idp_admin_session`).
- Client `gostay` **belum terdaftar** (grep `gostay` = 0). Tabel `OAuthClient`, seed `prisma/seed.ts`.
- OIDC lib: `oidc-provider` v8.5.3 (`src/lib/oidc-provider.ts`). **Tidak ada** grant `client_credentials` → guard endpoint baru pakai bearer key.

**Pola rumah (KasKecil `supabase/functions/whatsapp-webhook/index.ts` = Zentra `wa-inbound/index.ts`) — TIRU logikanya:**
- Auth webhook = bandingkan header `x-webhook-secret` dgn env; salah → 401.
- Idempotency: INSERT `*_inbound_messages` unik per `wa_message_id`; `23505` = duplikat → skip.
- Resolve identitas dari phone → tabel; tak dikenal → **bot DIAM** (anti-spam), tetap 200.
- `createClient(URL, SERVICE_ROLE)` sekali; **tenant_id di-pass eksplisit tiap insert** (RLS di-bypass).
- Confirm-before-write: `*_pending_actions` (upsert 1/phone); insert asli setelah balas "YA".
- Rate limit: tabel + RPC.
- AI: `fetch` ke `https://api.openai.com/v1/chat/completions`, model `gpt-4o-mini`, `temperature` rendah,
  output JSON ketat; **regex fallback** bila `OPENAI_API_KEY` kosong.

**Anti-pattern (JANGAN):**
- ❌ Bikin Deno edge function di GoStay — GoStay = Vercel Node. Ikuti `api/_lib/*`.
- ❌ Pakai `src/services/bookingService.ts` di server — itu import browser-client (RLS), akan gagal/ke-scope salah. Tulis jalur service-role sendiri.
- ❌ Resolve tenant dari `TENANT_SLUG` env untuk WA — tenant WA datang dari `sessionId`. Env slug hanya untuk flow web.
- ❌ Percaya nomor pengirim untuk tenant — tenant HANYA dari sessionId (nomor tujuan).
- ❌ Kirim `role` ke Ventera/insert profil — role milik DB (`profiles.role`), default `customer`.
- ❌ Balas ke `key.fromMe` — akan feedback-loop.

---

## Fase 1 — Ventera: endpoint provisioning + register client `gostay`  ⟨repo: sso-ventera⟩

**Tujuan:** ekspos primitif `createUser` yang sudah ada sebagai endpoint mesin-callable,
supaya GoStay bisa mint akun tamu by-phone tanpa browser.

**Kerjakan (COPY dari yang ada, jangan bikin logika baru):**
1. Route baru `apps/idp/pages/api/admin/users/provision.ts` (atau App Router `route.ts`):
   - Guard: header `Authorization: Bearer <PROVISION_API_KEY>` (env baru) — bandingkan `timingSafeEqual`. Tak cocok → 401.
   - Body: `{ phone, displayName?, email?, realm? }`.
   - **Reuse logika `createUser`** dari `apps/idp/src/app/admin/(authed)/users/actions.ts`
     (normalisasi phone via `realm.ts`, dedup realm-scoped, `phoneVerifiedAt: new Date()`, passwordless).
   - Idempoten: kalau `(realmId, phone)` sudah ada → kembalikan user existing (jangan 500).
   - Buat juga `LinkedAccount { provider:"whatsapp", providerAccountId: <digits> }` (pola sama seperti `pages/api/auth/register/verify-status.ts:165`).
   - Response: `{ ok:true, sub: user.id, created: boolean }`.
2. Register OAuthClient `gostay` di realm tamu (lewat `prisma/seed.ts` atau admin Clients UI).
   redirect_uri = origin GoStay `/auth/callback` (samakan dgn `VITE_SSO_*`).
3. Tambah `PROVISION_API_KEY` ke `.env`/deploy Ventera.

**Referensi:** `apps/idp/src/app/admin/(authed)/users/actions.ts` (createUser), `pages/api/auth/register/verify-status.ts` (LinkedAccount whatsapp), `prisma/seed.ts` (clients), `prisma/schema.prisma` (User/OAuthClient).

**Verifikasi:**
- `curl -H "Authorization: Bearer $PROVISION_API_KEY" -d '{"phone":"628123..."}' .../api/admin/users/provision` → `{ ok:true, sub:... }`.
- Panggil dua kali nomor sama → `created:false`, sub sama (idempoten).
- Tanpa/ salah bearer → 401.
- Query DB: `User` baru punya `phoneVerifiedAt`, tanpa password; ada `LinkedAccount` whatsapp.
- `SELECT` `OAuthClient` → `gostay` ada.

**Anti-pattern:** ❌ jangan longgarkan guard admin lama; ❌ jangan tambah grant `client_credentials`; ❌ jangan ubah schema (phone sudah unik passwordless).

---

## Fase 2 — GoStay: skema DB (migrasi `016_wa_booking.sql`)  ⟨repo: gostay⟩

**Tujuan:** tabel penopang WA. Semua `tenant_id` eksplisit; RLS enabled tapi **tanpa policy publik**
(hanya service-role yang menyentuh — pola `whatsapp_rate_limits` KasKecil migrasi line 121).

**Kerjakan** — buat `supabase/migrations/016_wa_booking.sql`:
- `wa_hotel_sessions ( id, session_id text UNIQUE NOT NULL, tenant_id uuid NOT NULL REFERENCES tenants(id), bot_number text, is_active bool default true, created_at )` — peta sessionId→hotel.
- `wa_guest_identities ( id, tenant_id uuid NOT NULL, phone_jid text NOT NULL, sso_sub text, profile_id uuid, customer_id uuid, status text default 'active', created_at, UNIQUE(tenant_id, phone_jid) )` — tamu per hotel. (Nomor sama boleh jadi tamu di >1 hotel → kunci komposit.)
- `wa_inbound_messages ( id, wa_message_id text UNIQUE NOT NULL, session_id text, phone_jid text, received_at, raw jsonb, created_at )` — idempotency.
- `wa_pending_actions ( id, tenant_id uuid NOT NULL, phone_jid text NOT NULL, kind text, payload jsonb, expires_at, created_at, UNIQUE(tenant_id, phone_jid) )` — state konfirmasi (1/phone/hotel).
- `wa_rate_limits ( phone_jid text, window_start, count )` + fungsi `check_wa_rate_limit(phone text, max int, window interval)` (tiru `check_whatsapp_rate_limit` KasKecil migrasi `20260624180000`).
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` untuk semua, **tanpa policy** (service-role bypass). Komentar tegas: "service-role only".

**Referensi:** GoStay migrasi 010–015 (pola tenant_id + RLS), KasKecil `supabase/migrations/20260624180000_add_whatsapp_integration.sql` (`whatsapp_links`, rate limit RPC) & `20260625110000_whatsapp_pending_actions.sql`.

**Verifikasi:**
- Terapkan migrasi ke DB dev; `\d wa_hotel_sessions` dll → kolom & constraint benar.
- INSERT contoh `wa_hotel_sessions('hotel-x-sess', <tenant_x>)` sukses.
- Uji `check_wa_rate_limit` menolak setelah N panggilan.
- Test lintas-tenant (tambah ke `supabase/tests/cross_tenant.mjs`): pastikan tabel wa tak bisa dibaca anon/authenticated biasa.

**Anti-pattern:** ❌ jangan bikin policy yang expose tabel wa ke role publik; ❌ jangan lupa FK `tenant_id`.

---

## Fase 3 — GoStay: kerangka webhook  ⟨repo: gostay⟩

**Tujuan:** `api/wa/inbound.ts` menerima POST wa-ventera, aman & idempoten, resolve tenant.
Belum ada AI/booking — hanya sampai "pesan diterima untuk tenant X dari phone Y".

**Kerjakan:**
1. `api/_lib/wa/client.ts` — `serviceClient()`: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (pola `provision.ts:config()` untuk env lazy). Export helper query.
2. `api/_lib/wa/inbound.ts` (helper, mirror `exchange.ts` yang teruji terpisah dari route):
   - `verifySecret(header)` vs `WA_WEBHOOK_SECRET` (`timingSafeEqual`).
   - `parseMessages(body)` → ekstrak `{ waMessageId, phoneJid, text, fromMe }[]` sesuai kontrak Fase 0.
   - `resolveTenant(sessionId)` → query `wa_hotel_sessions`; null → caller balas 200 diam.
   - `recordInbound(msg)` → INSERT `wa_inbound_messages`; tangani `23505` = duplikat → skip.
3. `api/wa/inbound.ts` (route Vercel): verifikasi secret → parse → skip `fromMe` → idempotency → resolve tenant (unknown/ inactive → 200 diam) → (Fase 4/5 lanjut). Selalu 200 ke gateway kecuali auth gagal (401), supaya gateway tak retry badai.

**Referensi:** `api/sso/token.ts` (bentuk route Vercel), `api/_lib/exchange.ts` (helper terpisah + test), pola dispatch `handleMessage` KasKecil `whatsapp-webhook/index.ts:1078`.

**Verifikasi:**
- Unit test `api/_lib/wa/inbound.test.ts` (pola `exchange.test.ts`): secret salah→401; body dgn `fromMe`→skip; sessionId tak dikenal→diam; wa_message_id dobel→idempoten.
- `curl` lokal POST sample payload → row masuk `wa_inbound_messages`, resolve tenant benar.
- `npm run build` hijau.

**Anti-pattern:** ❌ jangan balas 500 ke gateway untuk error biasa (picu retry); ❌ jangan proses `fromMe`.

---

## Fase 4 — GoStay: resolve/provision tamu (opsi B)  ⟨repo: gostay⟩ — butuh Fase 1 & 2

**Tujuan:** dari `phone_jid` + `tenant_id` → tamu yang punya profil GoStay + customer, via akun SSO Ventera.

**Kerjakan:**
1. `api/_lib/wa/guest.ts` `resolveOrProvisionGuest(phoneJid, tenantId, displayName?)`:
   - Cek `wa_guest_identities (tenant_id, phone_jid)` → kalau lengkap (`profile_id`,`customer_id`) → pakai.
   - Kalau belum: rate-limit `check_wa_rate_limit(phone, ...)` untuk cegah spam provision.
   - Panggil Ventera `POST /api/admin/users/provision` (Bearer `PROVISION_API_KEY`, body `{ phone, displayName }`) → `sub`.
   - `profileId = profileIdFor(sub)` (reuse `identity.ts`).
   - **Varian provision profil dgn tenant eksplisit:** refactor `provision.ts` → tambah
     `provisionProfileWithTenant({ profileId, ssoSub, tenantId, phone, fullName, now })` yang INSERT profil pakai `tenant_id` argumen (BUKAN resolve `TENANT_SLUG`). Sisakan `provisionProfile` lama utuh untuk flow web.
   - Service-role INSERT `customers { profile_id, tenant_id, full_name, phone }` (tiru `getOrCreateOwnCustomer` tapi service-role).
   - Simpan balik `sso_sub/profile_id/customer_id` ke `wa_guest_identities`.
   - Return `{ profileId, customerId, tenantId }`.

**Referensi:** `api/_lib/identity.ts:46` (`profileIdFor`), `api/_lib/provision.ts:89` (`runProvision` — pola INSERT service-role), `src/services/bookingService.ts:314` (`getOrCreateOwnCustomer` — logika yang di-port ke service-role).

**Verifikasi:**
- Test: nomor baru → Ventera dipanggil sekali, `wa_guest_identities` terisi, `profiles`+`customers` ada dgn `tenant_id` benar.
- Nomor sama panggil ulang → tak panggil Ventera lagi, tak bikin duplikat.
- Nomor sama di dua tenant berbeda → dua baris identity, dua profil/customer terpisah.
- Rate-limit blokir spam provision.
- Lintas-tenant: profil tamu Hotel X tak muncul di query Hotel Y (jalankan `cross_tenant.mjs`).

**Anti-pattern:** ❌ jangan derive `profileId` dari nomor HP (harus dari `sub` Ventera, konsisten dgn web); ❌ jangan resolve tenant dari env di jalur ini.

---

## Fase 5 — GoStay: AI + percakapan booking + confirm  ⟨repo: gostay⟩

**Tujuan:** dari teks tamu → slot booking terisi → ringkasan + "YA/BATAL" → booking `pending`.

**Kerjakan:**
1. `api/_lib/wa/ai.ts` — `extractBookingIntent(text, context)`:
   - `fetch` `https://api.openai.com/v1/chat/completions`, model `gpt-4o-mini`, `temperature: 0.1`,
     system prompt (Bahasa Indonesia) → JSON ketat `{ intent, check_in, check_out, guests, room_type_hint, confidence }`.
   - **Regex/keyword fallback** bila `OPENAI_API_KEY` kosong (tiru `extractTransactionFromText` KasKecil).
2. `api/_lib/wa/booking.ts` (service-role, tenant eksplisit):
   - `findRoomType(tenantId, hint)` & `getAvailableRoomsSrv(tenantId, checkIn, checkOut, roomTypeId)` — port dari `src/services/roomService.getAvailableRooms` ke service-role + filter `tenant_id`.
   - `createWaBooking({ tenantId, customerId, roomId, checkIn, checkOut, guests, total })` → INSERT `bookings` service-role: `status:"pending"`, `payment_status:"pending"`, `source:"whatsapp"`, `tenant_id` eksplisit, `created_by` = profil tamu. (Tiru `BookingReview.handleConfirm` `src/pages/portal/BookingReview.tsx:98`, TAPI service-role.)
3. Flow di `api/wa/inbound.ts`:
   - Slot belum lengkap → simpan progres di `wa_pending_actions(kind:"collecting")`, balas pertanyaan lanjutan.
   - Slot lengkap → cek ketersediaan → simpan `wa_pending_actions(kind:"confirm_booking", payload)`, balas ringkasan harga + "Balas YA untuk konfirmasi, BATAL untuk batal".
   - Pesan "YA" & ada pending `confirm_booking` (belum `expires_at`) → provision tamu (Fase 4) → `createWaBooking` → balas nomor referensi → hapus pending.
   - "BATAL" → hapus pending, balas.
4. Outbound `api/_lib/wa/send.ts` — `sendText(sessionId, toJid, text)`: POST `WA_VENTERA_BASE_URL/api/sessions/<sessionId>/send`, `Authorization: Bearer WA_VENTERA_INT_KEY`, body `{ to, type:"text", text }`.

**Referensi:** KasKecil `whatsapp-webhook/index.ts` (`extractTransactionFromText` 176, `setPending/getPending/clearPending` 716, dispatch YA 833), `src/pages/portal/BookingReview.tsx:68-129` (urutan customer→room→booking), `src/services/roomService.ts` (`getAvailableRooms`), wa-ventera `src/app/api/sessions/[id]/send/route.ts` (kontrak send).

**Verifikasi:**
- Test percakapan bertahap (mock OpenAI): "mau nginap 20-22 Juli buat 2 orang" → tanya tipe kamar → "deluxe" → ringkasan+YA → booking `pending` `source:"whatsapp"` `tenant_id` benar.
- Tanpa `OPENAI_API_KEY` → fallback tetap jalan.
- "BATAL" tak bikin booking. Pending kadaluarsa → "YA" ditolak.
- Ketersediaan 0 → balas ramah, tak insert.
- Booking muncul di dashboard staff Hotel X, tak muncul di Hotel Y.

**Anti-pattern:** ❌ jangan buat `status:"confirmed"` dari WA (hanya staff); ❌ jangan pakai browser `supabase` client; ❌ jangan balas tanpa cek `fromMe`/tenant.

---

## Fase 6 — Wiring operasional + verifikasi end-to-end & keamanan  ⟨lintas-repo⟩

**Kerjakan (operasional, minim kode):**
1. Env GoStay (`.env`, deploy): `WA_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
   `WA_VENTERA_BASE_URL`, `WA_VENTERA_INT_KEY` (`int_*`, ownernya harus admin/owner session hotel),
   `SSO_VENTERA_PROVISION_URL`, `PROVISION_API_KEY`. Dokumentasikan di `.env.example` (pola boundary seperti entry `TENANT_SLUG`).
2. Per hotel di wa-ventera: admin `POST /api/sessions {id:"hotel-x-sess"}` → scan QR HP hotel.
3. Tambah entri `WEBHOOK_ROUTES` wa-ventera: `{"sessionId":"hotel-x-sess","url":"<gostay>/api/wa/inbound","secret":"<WA_WEBHOOK_SECRET>"}`.
4. INSERT `wa_hotel_sessions('hotel-x-sess', <tenant_x>, '<nomor>')` di GoStay.

**Verifikasi end-to-end (real):**
- Kirim WA nyata ke nomor Hotel X → percakapan → YA → booking pending muncul di dashboard Hotel X.
- Kirim ke nomor Hotel Y → tenant Y, tak bocor ke X.
- Jalankan suite lengkap: `supabase/tests/cross_tenant.mjs` (target 18/18), RLS legacy (31/31), unit (`npm test`), `npm run build`.
- Skenario keamanan: (a) POST webhook tanpa secret → 401; (b) sessionId asing → diam; (c) spam provision → di-rate-limit; (d) tamu coba "confirm"/manipulasi harga via teks → server abaikan, harga dihitung server-side; (e) nomor pengirim dipalsu tak mengubah tenant (tenant dari sessionId).

**Anti-pattern:** ❌ jangan pasang `WEBHOOK_URL` global ke GoStay (akan tarik semua session non-hotel); pakai `WEBHOOK_ROUTES` per-session. ❌ jangan commit `int_*`/secret ke repo.

---

## Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Tamu spam bikin akun (abuse provision Ventera) | `check_wa_rate_limit` sebelum provision; provision idempoten; Ventera guard bearer |
| Nomor pengirim dipalsu untuk akses hotel lain | Tenant HANYA dari `sessionId`; nomor pengirim cuma identitas tamu di dalam tenant itu |
| Booking gratis via teks | Status `pending` saja; harga dihitung server; hanya staff `confirm` |
| Divergensi runtime (Deno vs Node) | GoStay tetap Vercel Node; hanya **logika** house-pattern yang ditiru |
| Ventera down saat provision | `resolveOrProvisionGuest` fail-closed → balas "coba lagi", jangan buat booking yatim |
| Double-insert dari retry gateway | `wa_inbound_messages` unik `wa_message_id`; selalu 200 kecuali auth |
| Kredensial bocor | Semua secret di env server, `.env` di-gitignore, `int_*` non-`VITE_` |

## Definition of Done
- Kirim WA ke nomor sebuah hotel → tamu ter-provision (akun SSO Ventera + profil+customer GoStay tenant itu) → booking `pending source=whatsapp` tenant benar → tampil ke staff hotel itu saja.
- Semua suite hijau (cross-tenant 18/18, RLS 31/31, unit, build).
- Tidak ada kebocoran lintas-tenant pada skenario keamanan Fase 6.
