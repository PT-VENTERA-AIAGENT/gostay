// Paying for a WhatsApp reservation inside the chat.
//
// Until now confirmBooking told the guest "kami akan menginformasikan langkah
// pembayaran melalui chat ini sebentar lagi" and then nothing ever did — there
// was no code anywhere that sent payment instructions over WhatsApp. This module
// closes that: the moment a booking is committed, the guest gets a hosted
// invoice link in the same conversation they booked in.
//
// ─── Never break a confirmed booking ─────────────────────────────────────────
// By the time this runs the reservation EXISTS. A gateway outage, an
// unconfigured hotel, or a malformed response must therefore never turn into a
// failed confirmation — the guest would be left believing their room was not
// booked when it was. Every path here degrades to "we'll follow up" wording
// instead of throwing.

import { getHotelPaymentMode } from "../payment/service";
import { handleCreateInvoice } from "../payment/handlers";
import { serviceGet } from "./client";

/** IDR, no decimals — the same formatting the rest of the WA replies use. */
function formatIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

/**
 * Whether this hotel takes online payment at all.
 *
 * A hotel with no hotel_payment_config row, or one switched off, settles at the
 * front desk — sending it a payment link would be wrong, not merely useless.
 * Read separately from getHotelPaymentMode because that folds is_active into
 * "test", which is the right answer for CHOOSING AN ENVIRONMENT and the wrong
 * one for deciding whether to charge at all.
 */
async function onlinePaymentEnabled(tenantId: string): Promise<boolean> {
  try {
    const res = await serviceGet(
      `hotel_payment_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=is_active&limit=1`,
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ is_active?: boolean }>;
    // No row → this hotel has never been switched on. Fail closed.
    return rows[0]?.is_active === true;
  } catch {
    return false;
  }
}

export interface PaymentInstruction {
  /** The WhatsApp message to send. Always present. */
  text: string;
  /** True when a real invoice link was minted. */
  hasLink: boolean;
}

/**
 * The payment message for a freshly confirmed booking.
 *
 * Returns wording either way: with a link when the hotel is on online payments
 * and the gateway answered, and a front-desk fallback otherwise. The caller
 * sends whatever comes back.
 */
export async function paymentInstruction(params: {
  tenantId: string;
  bookingReference: string | null;
  total: number;
  brand: string;
}): Promise<PaymentInstruction> {
  const { tenantId, bookingReference, total, brand } = params;

  const offline: PaymentInstruction = {
    text:
      `Total yang harus dibayar: *${formatIDR(total)}*.\n\n` +
      `Pembayaran dilakukan langsung di *${brand}* saat check-in. ` +
      "Simpan kode pesanan Anda untuk ditunjukkan di resepsionis ya.",
    hasLink: false,
  };

  // Without a reference we cannot ask the gateway for anything — the invoice is
  // keyed on it.
  if (!bookingReference) return offline;
  if (!(await onlinePaymentEnabled(tenantId))) return offline;

  try {
    const result = await handleCreateInvoice({ bookingReference });
    if (!result.ok || !result.invoiceUrl) {
      console.error(
        `[wa/payment] invoice for ${bookingReference} failed:`,
        result.ok ? "no_invoice_url" : result.error,
      );
      return pendingFallback(total);
    }

    // A test-mode invoice is a real, clickable Xendit page — it just does not
    // move money. Say so, so a hotel piloting the feature does not think a
    // sandbox payment settled their guest's bill.
    const modeNote =
      result.mode === "test"
        ? "\n\n_Catatan: pembayaran ini masih dalam mode uji coba._"
        : "";

    return {
      hasLink: true,
      text:
        `Total yang harus dibayar: *${formatIDR(result.amount ?? total)}*.\n\n` +
        `Silakan selesaikan pembayaran melalui tautan berikut:\n${result.invoiceUrl}\n\n` +
        "Kamar Anda kami konfirmasi otomatis setelah pembayaran diterima." +
        modeNote,
    };
  } catch (e) {
    console.error(`[wa/payment] invoice for ${bookingReference} threw:`, (e as Error).message);
    return pendingFallback(total);
  }
}

/**
 * What to say when online payment SHOULD have worked but did not. Distinct from
 * the offline wording: this hotel does take payment online, so promising the
 * front desk would be wrong — staff will follow up instead.
 */
function pendingFallback(total: number): PaymentInstruction {
  return {
    text:
      `Total yang harus dibayar: *${formatIDR(total)}*.\n\n` +
      "Mohon maaf, tautan pembayaran belum dapat kami buat saat ini. " +
      "Tim kami akan mengirimkan instruksi pembayaran melalui chat ini sesaat lagi.",
    hasLink: false,
  };
}

export { formatIDR as formatPaymentIDR, onlinePaymentEnabled, getHotelPaymentMode };
