# Resepsionis AI (Voice) — Arsitektur Fase 1

Status per 31 Juli 2026. Fase 1 = **AI yang bisa diajak bicara dan setiap
percakapan meninggalkan jejak**: transkrip + ringkasan masuk `call_logs`,
nomor penelepon masuk CRM. Belum ada nomor telepon sungguhan — lihat
"Jalan ke telepon sungguhan" di bawah.

## Gambar besar

```
FASE 1 (sekarang)                          FASE 1b (butuh nomor/SIP trunk)
┌─────────────────────────┐                ┌──────────────────────────────┐
│ Browser staf (/voice-ai)│                │ Penelepon → SIP trunk /      │
│ mic ⇄ WebRTC ⇄ OpenAI   │                │ platform voice-agent         │
│ Realtime API            │                │ (Vapi/Retell/rakitan VPS)    │
└───────────┬─────────────┘                └──────────────┬───────────────┘
            │ tool call: cek ketersediaan                  │ selesai telepon
            │ (klien supabase, RLS staf)                   ▼
            │ selesai bicara                POST /api/voice/call-ended
            ▼                               header x-voice-secret
  simpan via klien supabase                 (kontrak JSON di bawah)
  (call_logs + customers, RLS staf)                       │
            └───────────────┬─────────────────────────────┘
                            ▼
              call_logs (source='ai', transcript, ringkasan)
              customers  (nomor baru → tamu CRM otomatis)
```

Dua pintu masuk, SATU muara data. Halaman `/voice-ai` adalah pratinjau yang
bisa diuji hari ini tanpa infrastruktur telepon; webhook `call-ended` adalah
kontrak yang akan dipakai gateway telepon sungguhan nanti — sudah dibangun dan
diuji sekarang supaya fase 1b tinggal menyambungkan kabel.

## Komponen

| Komponen | Letak | Tugas |
|---|---|---|
| `POST /api/voice/session` | `api/voice/[action].ts` | Mencetak **ephemeral key** OpenAI Realtime untuk browser. Auth: JWT Supabase staf (ditandatangani `SUPABASE_JWT_SECRET`), role diverifikasi ke tabel `profiles` — kunci OpenAI asli tidak pernah menyentuh browser |
| `POST /api/voice/call-ended` | idem | Webhook selesai-telepon, provider-agnostik. Auth `x-voice-secret` = `VOICE_WEBHOOK_SECRET`. Menulis `call_logs` + find-or-create tamu CRM per nomor (tenant-scoped) |
| Halaman `/voice-ai` | `src/pages/VoiceAI.tsx` | WebRTC mic ⇄ Realtime; instruksi berisi nama hotel + tipe kamar & tarif ASLI; tool `check_availability` menjalankan RPC `available_rooms` yang sama dengan form booking; transkrip dikumpulkan dari event; "Akhiri & simpan" menulis log + tamu lewat klien supabase (RLS staf) |
| Migration 049 | `supabase/migrations/049_voice_ai.sql` | `call_logs.transcript` (text) + `call_logs.source` ('manual'\|'ai') |

## Kontrak webhook `POST /api/voice/call-ended`

```json
{
  "hotel": "lor-kali",                  // slug tenant — WAJIB
  "caller_phone": "+62812xxxxxx",       // WAJIB
  "caller_name": "Budi",                // opsional (kalau AI menangkap nama)
  "direction": "inbound",               // default inbound
  "duration_seconds": 183,
  "summary": "Tanya harga Deluxe utk 2-4 Agt; minta ditelepon balik",
  "transcript": "AI: Selamat pagi…\nTamu: …",
  "follow_up": true,                    // AI menilai perlu tindak lanjut staf
  "follow_up_due": "2026-08-01"
}
```

Balasan `200 {ok, callLogId, customerId, customerCreated}`. Idempotensi ada di
tangan pengirim (kirim sekali per panggilan); nomor yang sama tidak pernah
menggandakan tamu — pencarian per digit telepon, tenant-scoped, sebelum membuat.

`agent_id` di `call_logs` diisi profil **bot** hotel (profil yang sama dengan
pengirim balasan WA), jadi log AI dapat dibedakan dari log staf sekaligus lolos
kolom NOT NULL.

## Keputusan desain

- **Suara**: OpenAI Realtime API (speech-to-speech, WebRTC) — stack sudah
  memegang `OPENAI_API_KEY`; model & suara dioverride via `VOICE_REALTIME_MODEL`
  / `VOICE_REALTIME_VOICE`. Kalau kelak pindah ke platform voice-agent, yang
  berubah hanya sisi penelepon; kontrak `call-ended` tetap.
- **Vercel serverless tidak memegang audio.** Browser bicara LANGSUNG ke OpenAI
  lewat WebRTC dengan ephemeral key; serverless hanya mencetak key (umur
  ±1 menit) dan menerima hasil akhir. Untuk telepon sungguhan, proses
  panjangnya hidup di VPS (pola `wa-ventera`), bukan di Vercel.
- **AI tidak menulis ke database.** Ia hanya bicara dan memanggil tool baca
  (ketersediaan). Penulisan (log, tamu) terjadi setelah selesai, lewat jalur
  yang sudah ber-RLS/ber-secret. Fase 2 (membuat booking dari telepon) akan
  memakai jalur booking yang sudah ada, bukan akses DB langsung.

## Jalan ke telepon sungguhan (fase 1b — keputusan bisnis yang ditunggu)

1. Pilih penyedia nomor: SIP trunk lokal (Infobip/Telkom) atau platform
   voice-agent (Vapi/Retell — paling cepat, per-menit lebih mahal).
2. Gateway menjawab panggilan → pipeline suara yang sama → saat tutup telepon
   POST `call-ended` dengan `x-voice-secret`. GoStay tidak perlu berubah.
3. Fase 2: beri gateway akses tool booking (cek harga → buat booking → kirim
   tautan bayar via WA ke nomor penelepon — WA & pembayaran Nexus sudah jalan).
