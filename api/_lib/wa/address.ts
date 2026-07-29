// Menentukan ke ALAMAT MANA sebuah balasan WhatsApp harus dikirim.
//
// WhatsApp kadang hanya memberi `@lid` — alias privasi tanpa nomor telepon.
// Gateway MENERIMA kiriman ke alamat itu dan menjawab 200, lalu membuangnya
// diam-diam: tamu tidak menerima apa pun dan tidak ada satu pun sinyal
// kegagalan. Karena jawaban gateway tidak bisa dipercaya untuk kasus ini,
// alamat @lid harus dikenali di sisi kita, sebelum mengirim.
//
// Jalan keluarnya: bila hotel sudah mengisi nomor asli tamu di CRM, nomor itu
// yang dipakai — jadi percakapan yang tadinya buntu bisa dipulihkan tanpa
// menunggu WhatsApp membuka nomornya.

/** Hanya angka dari sebuah JID/nomor. */
export function digitsOf(value: string | null | undefined): string {
  return (value ?? "").replace(/\D+/g, "");
}

export function isLidJid(jid: string | null | undefined): boolean {
  return (jid ?? "").toLowerCase().endsWith("@lid");
}

/**
 * Apakah `phone` sebuah nomor telepon yang masuk akal untuk dikirimi pesan?
 *
 * Yang harus disingkirkan adalah nilai yang TERLIHAT seperti nomor tapi
 * sebenarnya angka dari sebuah LID: `callablePhone` menyimpannya sebagai
 * customers.phone ketika WhatsApp tidak memberi nomor asli, jadi membandingkan
 * dengan LID-nya sendiri adalah satu-satunya cara membedakan keduanya.
 */
export function isUsablePhone(phone: string | null | undefined, lidJid?: string | null): boolean {
  const d = digitsOf(phone);
  if (d.length < 8 || d.length > 15) return false;
  if (lidJid && d === digitsOf(lidJid)) return false; // angka LID, bukan nomor
  return true;
}

/** Bentuk JID yang dipakai gateway untuk sebuah nomor telepon. */
export function phoneToJid(phone: string): string {
  return `${digitsOf(phone)}@s.whatsapp.net`;
}

/**
 * Alamat terbaik untuk membalas, beserta alasannya.
 *
 * `unroutable` menandai kasus yang harus dilaporkan sebagai insiden meskipun
 * gateway menjawab sukses — tanpa itu kegagalan ini tetap tak terlihat.
 */
export interface OutboundTarget {
  jid: string;
  unroutable: boolean;
}

export function chooseOutboundTarget(params: {
  /** JID asal pesan masuk (bisa @lid). */
  phoneJid: string;
  /** Nomor pendamping dari WhatsApp, bila ada. */
  replyJid?: string | null;
  /** customers.phone — bisa berisi nomor asli yang diisi staf. */
  customerPhone?: string | null;
}): OutboundTarget {
  // 1. WhatsApp memberi nomor aslinya — selalu yang terbaik.
  if (params.replyJid) return { jid: params.replyJid, unroutable: false };

  // 2. Bukan LID: alamatnya memang sudah nomor telepon.
  if (!isLidJid(params.phoneJid)) return { jid: params.phoneJid, unroutable: false };

  // 3. LID, tapi hotel sudah mengisi nomor asli tamu di CRM.
  if (isUsablePhone(params.customerPhone, params.phoneJid)) {
    return { jid: phoneToJid(params.customerPhone as string), unroutable: false };
  }

  // 4. LID tanpa nomor mana pun: kirim tetap dicoba (siapa tahu gateway
  //    mendukungnya kelak), tapi ditandai supaya kegagalannya tercatat
  //    walau gateway menjawab sukses.
  return { jid: params.phoneJid, unroutable: true };
}
