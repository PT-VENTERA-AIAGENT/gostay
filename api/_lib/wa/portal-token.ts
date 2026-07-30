// Tautan portal yang sekaligus MEMASUKKAN tamu — tanpa SSO, tanpa password.
//
// Tamu hotel tidak punya akun yang bisa mereka ingat, dan memaksakan SSO pada
// mereka justru sumber kegagalan: nomor yang tidak terdaftar, realm yang keliru,
// OTP yang tak sampai. Padahal saluran yang jauh lebih kuat sudah ada — pesan
// WhatsApp itu sendiri. Ia hanya tiba di nomor yang memang memiliki percakapan
// tersebut, dan nomor itulah identitas si tamu.
//
// Jadi tautan portal yang dikirim bot membawa token bertanda tangan. Membukanya
// = masuk sebagai tamu itu, di hotel itu.
//
// ─── Batas yang dijaga ───────────────────────────────────────────────────────
//   * Token menyebut SATU tamu di SATU hotel. Ia tidak bisa dipakai untuk hotel
//     lain, dan tidak memberi peran apa pun selain 'customer' bawaan profilnya.
//   * Ditandatangani HMAC dengan rahasia server; tanpa rahasia itu token tidak
//     bisa dibuat, dan isinya tidak bisa diubah tanpa merusak tanda tangan.
//   * Berumur terbatas. Tautan ini tinggal selamanya di riwayat chat, jadi ia
//     tidak boleh menjadi kunci abadi.
//   * Tidak menyimpan apa pun: tanpa tabel, tanpa state — yang membuat token sah
//     hanyalah tanda tangan dan waktu.
//
// Yang SENGAJA tidak dilakukan: token ini tidak pernah mencetak sesi staf.
// Penukarnya memuat profil dari `customer_id` dan menolak bila profil itu bukan
// tamu — sebuah tautan bocor karena itu tidak bisa menjadi pintu ke dashboard.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Berapa lama sebuah tautan portal boleh dipakai masuk. */
const DEFAULT_TTL_DAYS = 30;

function ttlMs(): number {
  const raw = Number(process.env.WA_PORTAL_TOKEN_TTL_DAYS);
  const days = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Rahasia penanda tangan.
 *
 * Memakai SUPABASE_JWT_SECRET: ia sudah ada di setiap deployment, sudah menjadi
 * rahasia paling sensitif di sini (ia yang mencetak sesi), dan menambah satu
 * rahasia baru hanya menambah satu hal yang bisa lupa dipasang. Bisa dipisahkan
 * lewat WA_PORTAL_TOKEN_SECRET bila suatu saat perlu dirotasi sendiri.
 */
function secret(): string | undefined {
  return process.env.WA_PORTAL_TOKEN_SECRET || process.env.SUPABASE_JWT_SECRET;
}

const b64u = (b: Buffer) => b.toString("base64url");

export interface PortalTokenPayload {
  /** Tamu yang dituju — `customers.id`. */
  customerId: string;
  /** Hotel tempat tautan ini berlaku. */
  tenantId: string;
  /** Kedaluwarsa, epoch ms. */
  exp: number;
}

/**
 * Buat token untuk seorang tamu di sebuah hotel.
 *
 * Mengembalikan null bila rahasianya tidak terpasang — pemanggil lalu mengirim
 * tautan biasa. Tautan tanpa token tetap berguna (tamu bisa menelusuri hotel),
 * hanya tidak memasukkan mereka; itu jauh lebih baik daripada tidak mengirim
 * tautan sama sekali.
 */
export function mintPortalToken(
  customerId: string,
  tenantId: string,
  nowMs: number = Date.now(),
): string | null {
  const key = secret();
  if (!key || !customerId || !tenantId) return null;

  const payload: PortalTokenPayload = {
    customerId,
    tenantId,
    exp: nowMs + ttlMs(),
  };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

/**
 * Baca sebuah token, atau null bila ia tidak sah.
 *
 * Gagal TERTUTUP untuk setiap sebab: rahasia tak terpasang, bentuk salah, tanda
 * tangan tak cocok, kedaluwarsa. Pemanggil tidak diberi tahu sebab mana yang
 * terjadi — perbedaan itu hanya berguna bagi orang yang sedang menebak-nebak.
 */
export function readPortalToken(
  token: string | undefined | null,
  nowMs: number = Date.now(),
): PortalTokenPayload | null {
  const key = secret();
  if (!key || typeof token !== "string") return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = b64u(createHmac("sha256", key).update(body).digest());
  // Panjang harus sama sebelum timingSafeEqual — ia melempar bila berbeda.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: PortalTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.customerId !== "string" ||
    typeof payload.tenantId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (!(payload.exp > nowMs)) return null;

  return payload;
}
