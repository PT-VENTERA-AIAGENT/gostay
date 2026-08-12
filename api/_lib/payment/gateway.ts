// Creating a Xendit invoice.
//
// ─── Why this calls Xendit directly ──────────────────────────────────────────
// It used to POST to `<ventera-gateway>/internal/payment/create`, on the belief
// that the central gateway held the Xendit keys and minted invoices on each
// project's behalf. It does not, and never did.
//
// The Ventera service is a "Xendit Unified Callback Gateway" — its own words.
// Its entire job is the RETURN leg: Xendit posts one callback to one shared URL,
// the gateway looks up the routing row by the `GOSTAY-` external_id prefix, and
// forwards it to this project's webhook with `x-internal-token`. There is no
// invoice-creation endpoint anywhere in it; no call to api.xendit.co exists in
// that repository at all.
//
// So the outbound leg was aimed at something that was never there, and every
// booking fell back to "tautan pembayaran belum dapat kami buat" — a failure
// that looked like missing configuration and was in fact a missing capability.
//
// The two legs now sit where they belong:
//
//   create   GoStay ──────────────────────────────▶ api.xendit.co   (this file)
//   settle   Xendit ──▶ Ventera gateway ──▶ GoStay /api/payment/webhook
//                                            authenticated by INTERNAL_TOKEN_*
//
// The callback URL is configured once in the Xendit dashboard and is not sent
// per invoice, so nothing here needs to know the gateway's address.

import type { CreateInvoiceInput, CreatedInvoice } from "./xendit";
import type { TokenEnv } from "./token";

const XENDIT_INVOICES_URL = "https://api.xendit.co/v2/invoices";

/**
 * The Xendit secret key for an environment.
 *
 * Sandbox keys are `xnd_development_…`, live keys `xnd_production_…`. Kept in
 * two separate variables rather than one key plus a mode flag, so a hotel in
 * test mode physically cannot reach the live key.
 */
export function xenditKey(env: TokenEnv): string | undefined {
  return env === "production"
    ? process.env.XENDIT_API_KEY_PRODUCTION
    : process.env.XENDIT_API_KEY_SANDBOX;
}

/** Overridable for tests only; production always uses the constant above. */
function invoicesUrl(): string {
  return process.env.XENDIT_API_URL ?? XENDIT_INVOICES_URL;
}

export function isGatewayConfigured(env: TokenEnv): boolean {
  return Boolean(xenditKey(env));
}

/**
 * Create a hosted Xendit invoice and return its pay URL.
 *
 * Xendit authenticates with HTTP Basic: the secret key as the username, empty
 * password. `fetchImpl` is injectable for tests.
 *
 * Throws on any non-2xx. The caller (paymentInstruction) catches it and tells
 * the guest staff will follow up — by then the booking already exists, and a
 * payment failure must never undo it.
 */
export async function createInvoiceViaGateway(
  input: CreateInvoiceInput,
  env: TokenEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedInvoice> {
  const key = xenditKey(env);
  if (!key) throw new Error(`xendit_not_configured_${env}`);

  const res = await fetchImpl(invoicesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    },
    body: JSON.stringify({
      // Carries the GOSTAY- prefix the gateway routes the callback on, so the
      // return leg finds its way back to this project.
      external_id: input.externalId,
      amount: input.amount,
      ...(input.payerEmail ? { payer_email: input.payerEmail } : {}),
      description: input.description,
      ...(input.successRedirectUrl ? { success_redirect_url: input.successRedirectUrl } : {}),
      ...(input.invoiceDuration ? { invoice_duration: input.invoiceDuration } : {}),
      currency: "IDR",
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Xendit's own message is worth keeping: "duplicate external_id" and
    // "amount below minimum" are both actionable, and look identical without it.
    throw new Error(`xendit_create_failed_${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }

  return {
    id: String(body.id ?? ""),
    invoiceUrl: String(body.invoice_url ?? ""),
    status: String(body.status ?? "PENDING"),
    amount: Number(body.amount ?? input.amount),
    externalId: String(body.external_id ?? input.externalId),
  };
}
