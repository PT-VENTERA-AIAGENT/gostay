# Patch wa-ventera: tamu ber-alamat `@lid` tidak pernah menerima balasan

## Masalah (terbukti di produksi GoStay, 29 Jul 2026)

WhatsApp menyembunyikan nomor sebagian pengguna di balik alias privasi **LID**
(`181248240648388@lid`). Untuk tamu seperti ini:

- wa-ventera meneruskan pesan masuk **tanpa** `remoteJidAlt` (nomor aslinya),
  jadi GoStay tidak pernah tahu nomor tamu;
- saat GoStay membalas ke alamat `@lid` itu, wa-ventera **menjawab 200
  "sukses" lalu pesannya dibuang oleh WhatsApp** — tamu tidak menerima
  apa-apa dan tidak ada satu pun sinyal kegagalan.

Bukti: tabel `wa_incidents` GoStay kini mencatat
`unroutable_lid:gateway_reported_ok` untuk setiap kiriman ke `@lid`; tamu
bernomor asli menerima balasan, tamu LID tidak pernah.

Repo **Chatly** (milik org ini juga) sudah memecahkan persis masalah ini untuk
CRM-nya sendiri — lihat `workers/wa-inbound.handler.ts` fungsi
`jidToContactId()`, yang komentarnya menyebut gejala yang sama kata per kata:
*"routing to `<lid>@s.whatsapp.net` silently fails — WA accepts then drops
the msg."*

## Kuncinya: Baileys menyimpan pemetaan LID → nomor asli

```ts
const pnJid = await sock.signalRepository?.lidMapping?.getPNForLID?.("181248240648388@lid");
// → "62812xxxxxxx@s.whatsapp.net" bila pemetaan ada (terisi otomatis oleh
//   device-list sync tak lama setelah sesi open), atau null.
```

> Butuh Baileys yang cukup baru (Chatly memakai `baileys@7.0.0-rc13`). Kalau
> wa-ventera masih di 6.x, naikkan dulu — di 6.x kiriman ke `@lid` memang
> diterima lalu hilang.

## Patch 1 — saat MENERUSKAN pesan masuk, sertakan nomor aslinya

Di forwardIncoming (payload webhook ke integrasi):

```ts
const key = msg.key;
if (key.remoteJid?.endsWith("@lid") && !key.remoteJidAlt) {
  const lid = key.remoteJid.split(":")[0].replace(/@.*$/, "") + "@lid";
  const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(lid).catch(() => null);
  if (pn) key.remoteJidAlt = pn;   // GoStay sudah membaca field ini (kontrak lama)
}
```

GoStay **sudah** membaca `key.remoteJidAlt` dan otomatis menyimpan nomornya ke
CRM (self-healing) — tidak perlu perubahan apa pun di sisi GoStay.

## Patch 2 — saat MENGIRIM, terjemahkan `@lid` menjadi nomor

Di sendHumanized / handler `POST /api/sessions/{id}/send`, sebelum
`sock.sendMessage(jid, …)`:

```ts
if (jid.endsWith("@lid")) {
  const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid).catch(() => null);
  if (pn) jid = pn;
  else return res.status(422).json({ ok: false, error: "unroutable_lid" });
  // JANGAN kirim ke @lid lalu menjawab 200 — itulah bug yang menyembunyikan
  // kegagalan ini berhari-hari. GoStay menangani 422 dengan benar (dicatat
  // sebagai insiden + staf diberi tahu).
}
```

## Hasil setelah dua patch ini

1. Pesan masuk berikutnya dari tamu LID membawa nomor aslinya → GoStay
   mengisi CRM otomatis → semua balasan langsung sampai. **Nol tindakan user.**
2. Bila pemetaan belum tersedia, gagalnya **jujur** (422), bukan sukses palsu.
