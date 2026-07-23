// Orchestration for the payment module — the logic behind api/payment/[action].
// Gateway (Ventera) model: GoStay asks the gateway to create invoices and
// receives settlement callbacks from it. Kept out of the route file so it is
// unit-testable (the thin-shell convention used across api/).

import { getHotelPaymentMode, getBookingByReference, recordGatewayPayment } from "./service";
import { mapXenditStatus, envForMode, modeForEnv } from "./xendit";
import { createInvoiceViaGateway } from "./gateway";
import { matchGatewayToken } from "./token";

const PREFIX = "GOSTAY-";

/** external_id ⇄ booking reference. The gateway routes on the GOSTAY- prefix. */
export function externalIdFor(reference: string): string {
  return PREFIX + reference;
}
/** Strip the GOSTAY- prefix and any -R<n> retry suffix to recover the reference. */
export function referenceFromExternalId(externalId: string): string {
  return externalId.replace(new RegExp("^" + PREFIX), "").replace(/-R\d+$/, "");
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
      externalId: externalIdFor(booking.reference),
      amount,
      payerEmail: booking.customer_email ?? undefined,
      description: `Pembayaran reservasi ${booking.reference}`,
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
  if (!externalId || !gatewayRef || !(amount > 0)) {
    return { ok: false, status: 400, error: "malformed_webhook" };
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
