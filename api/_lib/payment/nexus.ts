// Klien Ventera-Nexus + verifikasi callback-nya.
//
// Nexus adalah lapisan pembayaran bersama Ventera (repo
// PT-VENTERA-AIAGENT/ventera-nexus, kontrak di docs/INTEGRASI.md). GoStay tidak
// lagi memegang alur pembuatan invoice Xendit sendiri: ia POST /v1/payments ke
// Nexus dengan API key per-environment, dan settlement pulang sebagai callback
// bertanda tangan HMAC — bukan lagi x-internal-token dari gateway callback lama.
//
// Dua aturan kontrak yang membentuk file ini:
//   - Idempotency-Key terikat pada HASH BODY. Body dibangun sekali, disimpan
//     (nexus_references.request_body), dan retry mengirim string yang sama.
//     Karena itu createNexusPayment menerima body yang SUDAH diserialisasi.
//   - Verifikasi callback mencoba SEMUA signing secret yang dikonfigurasi;
//     environment yang sah adalah yang secret-nya cocok. Header
//     X-Nexus-Environment tidak dipercaya — ia tidak ikut ditandatangani.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { TokenEnv } from "./token";

// Base URL API Nexus. Konstanta — hanya bisa dioverride lewat env untuk test
// (pola yang sama dengan XENDIT_API_URL di gateway.ts).
const NEXUS_API_BASE =
  "https://echdsmqwuuyhyqqjswax.supabase.co/functions/v1/nexus-api/v1";

function baseUrl(): string {
  return process.env.NEXUS_API_URL ?? NEXUS_API_BASE;
}

/** API key Nexus per environment. Sandbox nxs_sandbox_…, production nxs_live_…. */
export function nexusKey(env: TokenEnv): string | undefined {
  return env === "production"
    ? process.env.NEXUS_API_KEY_PRODUCTION
    : process.env.NEXUS_API_KEY_SANDBOX;
}

/** Signing secret callback per environment (dari nexus_set_app_endpoint). */
export function nexusSigningSecret(env: TokenEnv): string | undefined {
  return env === "production"
    ? process.env.NEXUS_SIGNING_SECRET_PRODUCTION
    : process.env.NEXUS_SIGNING_SECRET_SANDBOX;
}

export function isNexusConfigured(env: TokenEnv): boolean {
  return Boolean(nexusKey(env));
}

// ─── Reference ────────────────────────────────────────────────────────────────

// Crockford Base32 (tanpa I, L, O, U) — aturan §3 kontrak.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 8 karakter acak kriptografis. Bukan Math.random(): reference yang bisa
 *  ditebak memungkinkan orang menebak pesanan orang lain. */
export function randomReferenceSuffix(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += CROCKFORD[b % 32];
  return out;
}

/**
 * Kode merchant dari slug hotel: huruf besar, TANPA pemisah apa pun
 * ("lor-kali" → "LORKALI"). Satu segmen utuh membuat external_id di dashboard
 * Xendit dan log internal terbaca sebagai GOSTAY-LORKALI-…, bukan potongan
 * yang ambigu terhadap tanda hubung pemisah bagian reference.
 */
export function merchantCodeFor(hotelSlug: string | null | undefined): string {
  const code = (hotelSlug ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  return code || "HOTEL";
}

/** Tanggal YYYYMMDD zona Asia/Jakarta (aturan §3). */
export function jakartaYyyymmdd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // en-CA → "YYYY-MM-DD"
  return parts.replace(/-/g, "");
}

/**
 * Reference baru: {MERCHANT}-{YYYYMMDD}-{ACAK}.
 *
 * Sengaja TANPA segmen "GOSTAY": Nexus sendiri yang menambahkan kode app di
 * external_id provider (`GOSTAY-<reference>`), jadi menuliskannya di sini
 * menghasilkan GOSTAY-GOSTAY-… di dashboard Xendit dan log internal.
 * Jenis transaksi juga TIDAK dikodekan — pemetaan reference → booking hidup di
 * tabel nexus_references (pelajaran Sellix dengan prefix ASB-*).
 */
export function newNexusReference(
  hotelSlug: string | null | undefined,
  now: Date = new Date(),
): string {
  return `${merchantCodeFor(hotelSlug)}-${jakartaYyyymmdd(now)}-${randomReferenceSuffix()}`;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export interface NexusPayment {
  id: string;
  reference: string;
  status: string;
  amount: number;
  amount_paid: number;
  checkout_url: string | null;
  payment_method: string | null;
  payment_channel: string | null;
  environment: string;
  paid_at: string | null;
  updated_at: string | null;
}

// deno-lint tidak berlaku di sini; bentuk respons Nexus dipetakan longgar.
function toNexusPayment(raw: Record<string, unknown>): NexusPayment {
  return {
    id: String(raw.id ?? ""),
    reference: String(raw.reference ?? ""),
    status: String(raw.status ?? ""),
    amount: Number(raw.amount ?? 0),
    amount_paid: Number(raw.amount_paid ?? 0),
    checkout_url: typeof raw.checkout_url === "string" ? raw.checkout_url : null,
    payment_method: typeof raw.payment_method === "string" ? raw.payment_method : null,
    payment_channel: typeof raw.payment_channel === "string" ? raw.payment_channel : null,
    environment: String(raw.environment ?? ""),
    paid_at: typeof raw.paid_at === "string" ? raw.paid_at : null,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

function authHeaders(env: TokenEnv): Record<string, string> {
  const key = nexusKey(env);
  if (!key) throw new Error(`nexus_not_configured_${env}`);
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function parseOrThrow(
  res: Response,
  context: string,
): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Pesan error Nexus itu actionable (merchant_not_found, idempotency_key_reused)
    // dan tanpa dikutip semuanya terlihat sama dari luar.
    throw new Error(`nexus_${context}_failed_${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

/**
 * Daftarkan hotel sebagai merchant Nexus. Idempoten di sisi Nexus
 * (upsert pada app_id+external_ref), jadi aman dipanggil setiap kali membuat
 * pembayaran — pelajaran Sellix: toko yang belum terdaftar gagal bayar dengan
 * merchant_not_found, dan mendaftarkannya saat dipakai menghapus kelas
 * kegagalan itu.
 */
export async function ensureNexusMerchant(
  env: TokenEnv,
  merchant: { tenantId: string; hotelSlug: string | null; hotelName: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(`${baseUrl()}/merchants`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify({
      external_ref: merchant.tenantId,
      code: merchantCodeFor(merchant.hotelSlug),
      name: merchant.hotelName ?? merchant.hotelSlug ?? "Hotel GoStay",
    }),
  });
  await parseOrThrow(res, "merchant");
}

/**
 * POST /v1/payments. `body` WAJIB string yang sudah diserialisasi — string yang
 * sama disimpan di nexus_references.request_body dan dikirim ulang byte-per-byte
 * saat retry, karena Idempotency-Key Nexus terikat pada hash body.
 */
export async function createNexusPayment(
  env: TokenEnv,
  reference: string,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NexusPayment> {
  const res = await fetchImpl(`${baseUrl()}/payments`, {
    method: "POST",
    headers: { ...authHeaders(env), "Idempotency-Key": reference },
    body,
  });
  return toNexusPayment(await parseOrThrow(res, "create_payment"));
}

/** GET /v1/payments?updated_since=…&limit=… — untuk rekonsiliasi (§7). */
export async function listNexusPaymentsUpdatedSince(
  env: TokenEnv,
  sinceIso: string,
  limit = 200,
  fetchImpl: typeof fetch = fetch,
): Promise<NexusPayment[]> {
  const url =
    `${baseUrl()}/payments?updated_since=${encodeURIComponent(sinceIso)}` +
    `&limit=${limit}`;
  const res = await fetchImpl(url, { headers: authHeaders(env) });
  const body = await parseOrThrow(res, "list_payments");
  const rows = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
  return rows.map(toNexusPayment);
}

/** POST /v1/payments/{id}/sync — tarik status dari provider tanpa menunggu webhook. */
export async function syncNexusPayment(
  env: TokenEnv,
  paymentId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NexusPayment> {
  const res = await fetchImpl(
    `${baseUrl()}/payments/${encodeURIComponent(paymentId)}/sync`,
    { method: "POST", headers: authHeaders(env) },
  );
  return toNexusPayment(await parseOrThrow(res, "sync_payment"));
}

// ─── Verifikasi callback ──────────────────────────────────────────────────────

/** Toleransi umur timestamp callback. Replay dengan timestamp basi ditolak. */
const MAX_SKEW_SECONDS = 300;

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/** Perbandingan konstan-waktu; gagal-tertutup pada beda panjang. */
function safeHexEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verifikasi X-Nexus-Signature: sha256=HMAC(secret, "{timestamp}.{raw body}").
 *
 * Mengembalikan environment yang secret-nya cocok, atau null. Body harus BYTE
 * MENTAH dari request — parse lalu serialisasi ulang mengubah byte-nya dan
 * membuat signature selalu gagal (aturan §6 kontrak).
 */
export function verifyNexusSignature(
  rawBody: string,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  nowEpochSeconds: number = Math.floor(Date.now() / 1000),
): TokenEnv | null {
  if (!timestampHeader || !signatureHeader) return null;
  if (!/^\d+$/.test(timestampHeader)) return null;
  if (Math.abs(nowEpochSeconds - Number(timestampHeader)) > MAX_SKEW_SECONDS) return null;

  const m = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!m) return null;
  const given = m[1].toLowerCase();
  const message = `${timestampHeader}.${rawBody}`;

  // Coba semua secret; environment sah = yang cocok. Header environment tidak
  // dipakai untuk memilih — ia tidak ditandatangani.
  for (const env of ["production", "sandbox"] as const) {
    const secret = nexusSigningSecret(env);
    if (secret && safeHexEqual(hmacHex(secret, message), given)) return env;
  }
  return null;
}
