// Shared payment types + status/environment mapping.
//
// GoStay creates invoices by calling Xendit DIRECTLY (see gateway.ts on why the
// earlier "the Ventera gateway mints them for us" assumption was wrong). The
// gateway still owns the return leg: it receives Xendit's callback and forwards
// it here, so the status vocabulary below is what it hands over verbatim.
//
// live ⇄ production and test ⇄ sandbox map a hotel's mode onto BOTH the Xendit
// key used to create the invoice and the internal token that authenticates the
// callback, which is what keeps a test hotel from ever transacting live.

import type { TokenEnv } from "./token";

export type PaymentMode = "live" | "test";

/** live ⇄ production, test ⇄ sandbox. */
export function envForMode(mode: PaymentMode): TokenEnv {
  return mode === "live" ? "production" : "sandbox";
}
export function modeForEnv(env: TokenEnv): PaymentMode {
  return env === "production" ? "live" : "test";
}

/**
 * Normalise a Xendit invoice status (forwarded by the gateway) into the three
 * states we act on. Xendit sends PAID / SETTLED on success, EXPIRED on lapse.
 */
export function mapXenditStatus(status: string | undefined): "paid" | "expired" | "pending" {
  switch ((status ?? "").toUpperCase()) {
    case "PAID":
    case "SETTLED":
      return "paid";
    case "EXPIRED":
      return "expired";
    default:
      return "pending";
  }
}

export interface CreateInvoiceInput {
  externalId: string;   // GOSTAY-<booking reference> — the gateway routes on the GOSTAY- prefix
  amount: number;
  payerEmail?: string;
  description?: string;
  successRedirectUrl?: string;
}

export interface CreatedInvoice {
  id: string;
  invoiceUrl: string;
  status: string;
  amount: number;
  externalId: string;
}
