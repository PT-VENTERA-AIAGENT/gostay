// Orchestration for the payment module — the logic behind api/payment/[action].
// Gateway (Ventera) model: GoStay asks the gateway to create invoices and
// receives settlement callbacks from it. Kept out of the route file so it is
// unit-testable (the thin-shell convention used across api/).

import { getHotelPaymentMode, getBookingByReference, recordGatewayPayment } from "./service";
import { mapXenditStatus, envForMode, modeForEnv } from "./xendit";
import { createInvoiceViaGateway } from "./gateway";
import { matchGatewayToken } from "./token";
import {
  isSubscriptionExternalId, findInvoiceForCallback, markInvoicePaidFromCallback,
} from "./subscription";

const PREFIX = "GOSTAY-";

/** Setiap referensi booking dimulai dengan ini — jangkar untuk membacanya kembali. */
const REFERENCE_MARKER = "BK-";

/**
 * Slug hotel dalam bentuk yang aman untuk external_id: huruf besar, dan apa pun
 * selain huruf/angka menjadi satu tanda hubung. Xendit menerima ini apa adanya,
 * dan bentuknya tetap enak dibaca di dashboard mereka.
 */
function slugSegment(hotelSlug: string): string {
  return (hotelSlug ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * external_id untuk sebuah invoice: `GOSTAY-<HOTEL>-<referensi>`.
 *
 * Dua hal yang harus benar sekaligus, dan keduanya alasan bentuk ini dipilih:
 *
 *   1. Router callback Ventera memilih tujuan berdasarkan awalan `GOSTAY-`, jadi
 *      awalan itu tidak boleh bergeser satu karakter pun.
 *   2. Di dashboard Xendit, sebuah pembayaran harus bisa langsung dikenali milik
 *      hotel mana. Tanpa nama hotel, satu akun Xendit yang melayani banyak hotel
 *      hanya memperlihatkan deretan kode booking yang tak berarti bagi manusia —
 *      dan itu jadi masalah nyata begitu produksi menampung hotel kedua.
 *
 * Nama hotel boleh kosong (mis. slug tenant belum terbaca); hasilnya kembali ke
 * bentuk lama `GOSTAY-<referensi>` yang tetap sah dan tetap terbaca.
 */
export function externalIdFor(reference: string, hotelSlug?: string | null): string {
  const hotel = slugSegment(hotelSlug ?? "");
  return hotel ? `${PREFIX}${hotel}-${reference}` : PREFIX + reference;
}

/**
 * Baca referensi booking dari sebuah external_id.
 *
 * Mencari POLA referensinya, bukan memotong awalan dengan panjang tetap — sebab
 * segmen nama hotel panjangnya berbeda-beda per hotel, dan yang lebih penting:
 * invoice yang sudah terbit sebelum perubahan ini membawa bentuk lama
 * `GOSTAY-<referensi>`. Kalau pembacaan di sini hanya mengerti bentuk baru,
 * pembayaran atas invoice-invoice lama itu gagal dicatat — tamu membayar, uangnya
 * masuk ke Xendit, dan reservasinya tetap menunggu selamanya.
 *
 * Sufiks percobaan ulang `-R<n>` tetap dibuang seperti sebelumnya.
 */
export function referenceFromExternalId(externalId: string): string {
  const stripped = (externalId ?? "")
    .replace(new RegExp("^" + PREFIX), "")
    .replace(/-R\d+$/, "");
  // Kemunculan TERAKHIR, bukan yang pertama: sebuah slug hotel pun boleh memuat
  // "BK-" (mis. hotel bernama "BK Residence") tanpa membuat referensinya salah
  // dibaca. Bentuk lama tanpa segmen hotel punya penanda ini di posisi 0, jadi
  // aturan yang sama melayani keduanya.
  const at = stripped.lastIndexOf(REFERENCE_MARKER);
  return at > 0 ? stripped.slice(at) : stripped;
}

export interface CreateInvoiceRequest {
  bookingReference: string;
  amount?: number;             // defaults to the booking's outstanding balance
  successRedirectUrl?: string;
}

export type CreateInvoiceResult =
  | { ok: true; invoiceUrl: string; invoiceId: string; amount: number; mode: string }
  | { ok: false; status: number; error: string };

/**
 * Create an invoice for a booking's outstanding balance via the gateway, using
 * the booking's HOTEL's live/test mode. external_id = GOSTAY-<reference> so the
 * settlement callback ties back to the booking with no extra state.
 */
export async function handleCreateInvoice(
  req: CreateInvoiceRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateInvoiceResult> {
  const booking = await getBookingByReference(req.bookingReference);
  if (!booking) return { ok: false, status: 404, error: "booking_not_found" };

  const outstanding = booking.total_amount - booking.amount_paid;
  const amount = req.amount ?? outstanding;
  if (!(amount > 0)) return { ok: false, status: 400, error: "nothing_to_pay" };

  const mode = await getHotelPaymentMode(booking.tenant_id);
  const env = envForMode(mode);

  const invoice = await createInvoiceViaGateway(
    {
      externalId: externalIdFor(booking.reference, booking.hotel_slug),
      amount,
      payerEmail: booking.customer_email ?? undefined,
      // Nama hotelnya disebut: ini teks yang dilihat TAMU di halaman pembayaran
      // Xendit, dan "Pembayaran reservasi BK-…" saja tidak memberi tahu mereka
      // sedang membayar ke siapa.
      description: booking.hotel_name
        ? `Pembayaran reservasi ${booking.reference} — ${booking.hotel_name}`
        : `Pembayaran reservasi ${booking.reference}`,
      successRedirectUrl: req.successRedirectUrl,
    },
    env,
    fetchImpl,
  );

  return { ok: true, invoiceUrl: invoice.invoiceUrl, invoiceId: invoice.id, amount, mode };
}

export type WebhookResult =
  | { ok: true; outcome: "recorded" | "duplicate" | "ignored"; status: number }
  | { ok: false; status: number; error: string };

/**
 * Process a settlement callback from the gateway. Authenticated by the
 * environment internal token (production/sandbox) — which one matched also
 * decides whether the recorded payment is stamped live or test, so a sandbox
 * settlement can never be booked as live. A non-paid status is acknowledged and
 * ignored. Idempotent via gateway_ref.
 *
 * Expected payload (gateway → GoStay), same shape as Storo's confirm:
 *   { external_id, invoice_id, status, amount, environment? }
 */
export async function handleWebhook(
  internalTokenHeader: string | undefined,
  body: Record<string, unknown>,
): Promise<WebhookResult> {
  const env = matchGatewayToken(internalTokenHeader);
  if (!env) return { ok: false, status: 401, error: "unauthorized" };

  const status = mapXenditStatus(body.status as string | undefined);
  if (status !== "paid") return { ok: true, outcome: "ignored", status: 200 };

  const externalId = String(body.external_id ?? "");
  const gatewayRef = String(body.invoice_id ?? body.id ?? "");
  const amount = Number(body.amount ?? body.paid_amount ?? 0);
  // Yang BENAR-BENAR diterima. Pada payload invoice Xendit, `amount` adalah
  // nominal tagihannya dan `paid_amount` yang dibayar — jadi urutannya harus
  // terbalik dari baris di atas. Membaca `amount` di sini membuat setiap
  // pemeriksaan kurang bayar membandingkan tagihan dengan dirinya sendiri, dan
  // tidak akan pernah menyala. Tetap aman kalau router callback hanya mengirim
  // salah satunya.
  const paidAmount = Number(body.paid_amount ?? body.amount ?? 0);
  if (!externalId || !gatewayRef || !(amount > 0)) {
    return { ok: false, status: 400, error: "malformed_webhook" };
  }

  // ── Tagihan langganan Ventera (056) ──
  //
  // Diperiksa SEBELUM pencarian booking, dan itu bukan sekadar urutan yang
  // rapi: referenceFromExternalId() mencari penanda "BK-" yang tidak ada di
  // external_id langganan, jadi ia akan mengembalikan potongan string yang
  // tidak berarti dan callback-nya jatuh sebagai booking_not_found.
  //
  // Cabang ini SENGAJA tidak memanggil recordGatewayPayment(): uang langganan
  // milik Ventera. Mencatatnya sebagai `payments` akan mengkredit saldo hotel
  // dengan uang yang ditagihkan kepadanya, lalu memotong 7% darinya.
  if (isSubscriptionExternalId(externalId)) {
    const invoice = await findInvoiceForCallback(gatewayRef, externalId);
    if (!invoice) return { ok: false, status: 404, error: "subscription_invoice_not_found" };
    const outcome = await markInvoicePaidFromCallback(invoice, gatewayRef, modeForEnv(env), paidAmount);
    if (outcome === "recorded" || outcome === "duplicate") {
      return { ok: true, outcome, status: 200 };
    }
    // Sisanya: uang sudah masuk ke Ventera tapi tagihannya SENGAJA tidak
    // dilunasi. Dijawab 200 karena mengulang tidak akan mengubah apa pun, dan
    // dicatat keras — ini justru keadaan yang butuh mata manusia.
    console.error(
      `[payment/webhook] langganan tidak dilunasi (${outcome}): invoice ${invoice.id}, ` +
      `diterima ${paidAmount} dari ${invoice.amount}, status ${invoice.status}, ref ${gatewayRef}`,
    );
    return { ok: true, outcome: "ignored", status: 200 };
  }

  const reference = referenceFromExternalId(externalId);
  const booking = await getBookingByReference(reference);
  if (!booking) return { ok: false, status: 404, error: "booking_not_found" };

  // The token's environment is authoritative for how we stamp the payment. The
  // 5% fee itself is applied by the SQL balance-credit trigger (reads fee_bps in
  // SQL), so there's nothing fee-related to compute here.
  const outcome = await recordGatewayPayment({
    tenantId: booking.tenant_id,
    bookingId: booking.id,
    amount,
    gatewayRef,
    mode: modeForEnv(env),
  });
  return { ok: true, outcome, status: 200 };
}
