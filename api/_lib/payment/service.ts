// Server-side DB access for the payment module, over PostgREST with the
// service_role key (bypasses RLS). Reuses the generic service-role fetch
// helpers already established for the WhatsApp webhook (api/_lib/wa/client.ts) —
// they are domain-neutral CRUD wrappers, not WA-specific.

import { serviceGet, serviceInsert, isConfigured } from "../wa/client";
import type { PaymentMode } from "./xendit";

export { isConfigured };

/**
 * The GLOBAL platform fee in basis points (700 = 7%). Falls back to 700.
 *
 * Not what any one hotel is actually charged: since 055 a hotel on the monthly
 * subscription pays 0. If you need a hotel's real rate, read
 * `hotel_fee_bps(tenant)` in the DB (or mirror it with feeBpsFor() from ./fee) —
 * using this number per-hotel would bill a subscriber twice.
 */
export async function getFeeBps(): Promise<number> {
  const res = await serviceGet("payment_config?id=eq.true&select=platform_fee_bps&limit=1");
  if (!res.ok) throw new Error(`payment_config_read_failed_${res.status}`);
  const rows = (await res.json()) as Array<{ platform_fee_bps?: number }>;
  return typeof rows[0]?.platform_fee_bps === "number" ? rows[0].platform_fee_bps : 700;
}

/**
 * The effective live/test mode for one hotel. Per-hotel row wins; a hotel with
 * online payments switched off (is_active=false) is forced to 'test' so it can
 * never transact live by accident; otherwise falls back to the global default.
 */
export async function getHotelPaymentMode(tenantId: string): Promise<PaymentMode> {
  const res = await serviceGet(
    `hotel_payment_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=mode,is_active&limit=1`,
  );
  if (res.ok) {
    const rows = (await res.json()) as Array<{ mode?: string; is_active?: boolean }>;
    const row = rows[0];
    if (row) return row.is_active === false ? "test" : row.mode === "live" ? "live" : "test";
  }
  // No per-hotel row → global default from payment_config.
  const g = await serviceGet("payment_config?id=eq.true&select=mode&limit=1");
  if (g.ok) {
    const rows = (await g.json()) as Array<{ mode?: string }>;
    if (rows[0]?.mode === "live") return "live";
  }
  return "test";
}

export interface BookingForPayment {
  id: string;
  tenant_id: string;
  reference: string;
  total_amount: number;
  amount_paid: number;
  customer_email: string | null;
  /** Slug hotelnya, untuk external_id + deskripsi invoice. Null bila tak terbaca. */
  hotel_slug: string | null;
  /** Nama hotel apa adanya, untuk deskripsi yang dibaca tamu di halaman Xendit. */
  hotel_name: string | null;
}

/** Look up a booking by its guest-facing reference (external_id minus GOSTAY-). */
export async function getBookingByReference(reference: string): Promise<BookingForPayment | null> {
  const q =
    `bookings?reference=eq.${encodeURIComponent(reference)}` +
    `&select=id,tenant_id,reference,total_amount,amount_paid,customers(email),tenants(slug,name)&limit=1`;
  const res = await serviceGet(q);
  if (!res.ok) throw new Error(`booking_read_failed_${res.status}`);
  const rows = (await res.json()) as Array<{
    id: string; tenant_id: string; reference: string;
    total_amount: number; amount_paid: number;
    customers?: { email?: string | null } | null;
    tenants?: { slug?: string | null; name?: string | null } | null;
  }>;
  const b = rows[0];
  if (!b) return null;
  return {
    id: b.id, tenant_id: b.tenant_id, reference: b.reference,
    total_amount: Number(b.total_amount), amount_paid: Number(b.amount_paid),
    customer_email: b.customers?.email ?? null,
    hotel_slug: b.tenants?.slug ?? null,
    hotel_name: b.tenants?.name ?? null,
  };
}

/** True when a payment already exists for this gateway ref (webhook idempotency). */
export async function gatewayRefExists(gatewayRef: string): Promise<boolean> {
  const res = await serviceGet(
    `payments?gateway_ref=eq.${encodeURIComponent(gatewayRef)}&select=id&limit=1`,
  );
  if (!res.ok) throw new Error(`payment_lookup_failed_${res.status}`);
  const rows = (await res.json()) as unknown[];
  return rows.length > 0;
}

export interface RecordPaymentInput {
  tenantId: string;
  bookingId: string;
  amount: number;
  gatewayRef: string;   // invoice id
  mode: PaymentMode;    // stamped as payment_env
}

/**
 * Record a settled online payment. Idempotent: a duplicate gateway_ref is a
 * no-op (both the pre-check here and the UNIQUE index in migration 030 guard it,
 * so a webhook retry can never double-credit the hotel).
 *
 * Inserting the row is all we do — the DB triggers then (a) recompute the
 * booking's amount_paid/payment_status and (b) credit the hotel balance net of
 * the 5% platform fee.
 */
export async function recordGatewayPayment(input: RecordPaymentInput): Promise<"recorded" | "duplicate"> {
  if (await gatewayRefExists(input.gatewayRef)) return "duplicate";
  const res = await serviceInsert("payments", {
    tenant_id: input.tenantId,
    booking_id: input.bookingId,
    amount: input.amount,
    method: "transfer",
    gateway: "xendit",
    gateway_ref: input.gatewayRef,
    payment_env: input.mode,
    note: `Gateway ${input.mode} — ${input.gatewayRef}`,
  });
  // A concurrent webhook that wins the race trips the UNIQUE index → 409.
  if (res.status === 409) return "duplicate";
  if (!res.ok) throw new Error(`payment_insert_failed_${res.status}`);
  return "recorded";
}

/**
 * Profil pemilik sebuah pesanan, atau null kalau pesanannya tidak ada.
 *
 * Dipakai satu-satunya jalur pembayaran yang dipicu peramban: tamu membuktikan
 * dirinya dengan token Supabase-nya sendiri, lalu kepemilikan diperiksa DI SINI
 * dengan service key — bukan dengan mempercayai nomor pesanan yang ia kirim.
 * Tanpa langkah ini, siapa pun yang menebak sebuah `reference` bisa menerbitkan
 * invoice atas pesanan orang lain.
 */
export async function bookingOwnerProfileId(reference: string): Promise<string | null> {
  const res = await serviceGet(
    `bookings?reference=eq.${encodeURIComponent(reference)}&select=customers(profile_id)&limit=1`,
  );
  if (!res.ok) throw new Error(`booking_owner_read_failed_${res.status}`);
  const rows = (await res.json()) as Array<{ customers?: { profile_id?: string | null } | null }>;
  return rows[0]?.customers?.profile_id ?? null;
}
