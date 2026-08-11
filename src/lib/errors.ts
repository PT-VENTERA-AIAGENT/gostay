/**
 * Satu pintu antara kegagalan teknis dan kalimat yang dibaca tamu.
 *
 * Sebelumnya layar portal menampilkan `e.message` apa adanya. Untuk kegagalan
 * yang datang dari Supabase/PostgREST, itu berarti tamu membaca kalimat seperti
 * "new row violates row-level security policy for table \"bookings\"" —
 * menyebut nama tabel, nama policy, dan bentuk dalam sistem. Tidak menolong
 * siapa pun yang membacanya, dan memberi tahu terlalu banyak kepada yang tidak
 * seharusnya.
 *
 * Aturannya: hanya kalimat yang KITA tulis sendiri yang boleh tampil. Semua
 * lemparan lain jatuh ke kalimat umum, sementara detail teknisnya tetap utuh di
 * konsol untuk yang memperbaikinya.
 */

/** Kegagalan yang pesannya memang ditujukan kepada pengguna. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Kalimat untuk ditampilkan, dengan detail teknis dibuang ke konsol.
 *
 * `fallback` harus menyebut apa yang gagal dan apa yang bisa dilakukan —
 * "Terjadi kesalahan" saja meninggalkan tamu tanpa langkah berikutnya.
 */
export function humanMessage(e: unknown, fallback: string): string {
  if (e instanceof UserFacingError) return e.message;
  // Bukan untuk tamu, tapi jangan hilang: tanpa ini kegagalan tak dikenal
  // menjadi kalimat umum yang tidak bisa ditelusuri siapa pun.
  console.error("[portal] galat teknis:", e);
  return fallback;
}
