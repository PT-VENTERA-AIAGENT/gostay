// Shared payment types + status/environment mapping for the gateway model.
//
// In the gateway model GoStay does NOT hold Xendit keys or call Xendit directly
// — the Ventera gateway does. What GoStay still needs is (a) the invoice-status
// vocabulary Xendit uses (which the gateway forwards verbatim) and (b) the
// mapping between a hotel's live/test mode and the gateway's
// production/sandbox environment tokens.

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
