---
name: gostay-wa
description: Diagnosa dan perbaikan jalur WhatsApp GoStay - gateway Baileys self-hosted, pairing QR, alias LID, kegagalan kirim, dan flow percakapan. Pakai saat pesan tidak sampai, QR tidak muncul, balasan bot salah/telat, atau saat menyentuh api/wa/** dan wa_flows. Trigger - "pesan WA tidak sampai", "error 463", "LID", "QR tidak muncul", "bot tidak balas", "deliveryFailures", "deploy wa-ventera".
---

# GoStay — jalur WhatsApp

## Yang paling sering disalahpahami

"wa-ventera" **bukan layanan pihak ketiga**. Itu gateway Baileys milik Ventera
sendiri, source-nya ada di mesin ini: `D:\Project\wa-ventera` (branch
`fix/lid-resolve`). Nama itu peninggalan sejarah. Kalau ada yang bilang "hubungi
vendor WA", itu salah — kita yang punya kodenya.

## Peta jalur

```
Tamu ──WhatsApp──▶ gateway Baileys (VPS :3061)
                        │  POST /api/wa/inbound  (x-webhook-secret)
                        ▼
                   GoStay  ──▶ wa_hotel_sessions (session_id = slug tenant)
                        │         is_active=true saja yang dilayani
                        ▼
                   pilih flow: api/_lib/wa/flow/select.ts   (wa_flows buatan hotel)
                        │  gerbang requires:'inhouse' = punya booking checked_in
                        ▼ (kalau tak ada flow cocok)
                   api/_lib/wa/converse.ts  (percakapan booking bawaan)
                        │
                   alamat kirim: api/_lib/wa/address.ts
                        ▼
                   POST /api/sessions/{id}/send  ──▶ gateway ──▶ Tamu
```

Endpoint gateway (auth `Bearer WA_VENTERA_INT_KEY`, base `WA_VENTERA_BASE_URL`):
`POST /api/sessions` · `GET /api/sessions/{id}` · `GET /api/sessions/{id}/qr`
(SSE) · `DELETE /api/sessions/{id}` · `POST /api/sessions/{id}/send`
(`{to, type:"text", text}`).

## Empat kebenaran yang mengubah cara membaca gejala

### 1. Sukses dari `POST /send` BUKAN bukti sampai

Balasan 200 hanya berarti stanza ditulis ke socket. WhatsApp bisa menolaknya
beberapa detik kemudian lewat ack asinkron. Penolakan itu dilaporkan gateway
sebagai `deliveryFailures[]` ke `/api/wa/inbound`, dicatat di `wa_incidents`
dengan alasan `rejected_by_whatsapp:*`, dan tampil di `/platform/incidents`.

**Jadi: kalau tamu bilang tidak menerima, buka `/platform/incidents` dulu —
bukan log `send`.**

`error 463` = privacy token kontak belum terbit. Gateway sengaja mengulang
kiriman sekali, karena penolakan itu sendirilah yang memicu penerbitan token.

### 2. Jebakan LID

WhatsApp menyembunyikan nomor sebagian tamu di balik alias `@lid`.
`api/_lib/wa/address.ts` memilih alamat kirim dengan urutan: nomor pendamping →
nomor asli → nomor di CRM. Sisi gateway sudah diperbaiki (30 Jul): **LID kini
alamat yang BENAR dan tidak lagi diturunkan menjadi nomor.**

Kalau ada kode/komentar yang masih "menormalkan" LID jadi nomor telepon, itu
peninggalan lama dan justru merusak.

### 3. Jeda ~8 detik antar balasan itu disengaja

Cooldown per-kontak di gateway. Kiriman yang tertahan **DIANTRE** (FIFO per
kontak), tidak dibuang. Dulu dibuang — itulah sebabnya pesan ke-2 dan ke-3 tak
pernah tiba. Jangan "memperbaiki" ini dengan mengirim paralel.

### 4. Baileys wajib ≥ 7.0.0-rc13

Di rc10, kiriman ke akun yang sudah migrasi LID melapor sukses (dapat
`messageId`) tapi tidak pernah tiba. Ini gejala yang paling menyesatkan di
seluruh sistem. Cek versi sebelum menduga hal lain.

## Nomor Indonesia

`08…` dan `+62…` adalah orang yang sama (fix di commit `945169b`). Normalisasi
harus dipakai konsisten di pencocokan CRM; jangan menulis perbandingan nomor
mentah baru.

## Perintah diagnosa

```bash
node scripts/wa-diagnose.mjs      # status sesi, mapping, kesehatan gateway
node scripts/wa-flow-audit.mjs    # audit wa_flows: node yatim, gerbang salah
```

## Deploy ulang gateway

```bash
# 1. Salin source dari mesin dev ke server (SSH key sudah terpasang)
rsync -az --delete D:/Project/wa-ventera/ ventera@103.93.162.172:/opt/wa-gostay/

# 2. Di server
ssh ventera@103.93.162.172
cd /opt/wa-gostay
sudo docker compose --env-file .env.production -f docker-compose.prod.yml build app
sudo docker compose --env-file .env.production -f docker-compose.prod.yml up -d app
sudo docker logs -f wa-gostay-app-1
```

Container `wa-gostay-app-1`, port 3061 = `WA_VENTERA_BASE_URL`.

Deploy gateway **menghentikan sesi yang sedang berjalan**. Konfirmasi ke user
dulu — hotel yang sedang melayani tamu akan kehilangan koneksi sampai container
naik lagi, dan sesi yang tidak persist harus pairing QR ulang.

## Urutan diagnosa "pesan tidak sampai"

1. `/platform/incidents` — ada `rejected_by_whatsapp:*` untuk nomor itu?
   → ya: baca alasannya (463 = privacy token, sudah di-retry sekali).
2. `node scripts/wa-diagnose.mjs` — sesi hotel itu `connected`?
   → tidak: pairing QR ulang lewat `/settings/whatsapp`.
3. `wa_hotel_sessions` — `is_active = true`? Webhook hanya melayani yang aktif.
4. Versi Baileys di gateway ≥ 7.0.0-rc13?
5. Baru setelah itu curigai `address.ts` / pemilihan flow.

## Menyentuh flow percakapan

- Builder UI: `/settings/wa-flows` → `src/pages/settings/WaFlowEditor.tsx`
- Seleksi: `api/_lib/wa/flow/select.ts`. Gerbang `requires:'inhouse'` berarti
  tamu punya booking berstatus `checked_in`.
- Fallback: `api/_lib/wa/converse.ts` (percakapan booking bawaan).
- Logika graf punya test unit: `src/lib/waFlowGraph.test.ts`. Tambahkan kasus di
  sana kalau mengubah traversal.
- Ambil-alih manusia: 039 (`wa_bot_takeover`) — bot diam saat staf mengambil
  alih percakapan.
