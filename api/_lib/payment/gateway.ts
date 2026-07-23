// Client for the central Ventera payment gateway.
//
// The gateway holds the Xendit keys (sandbox + live) and owns invoice creation
// and the Xendit webhook; GoStay authenticates to it with the per-environment
// internal token. This mirrors the contract GoStay is registered under in the
// gateway's routing table (prefix "GOSTAY", environment production/sandbox).
//
// NOTE: the create-invoice path/shape below follows the gateway's documented
// convention (`POST <gateway>/internal/payment/create`, sibling of the
// `/internal/payment/confirm` callback shown in the routing form). If the
// gateway exposes a different path, change GATEWAY_CREATE_PATH — nothing else.

import type { CreateInvoiceInput, CreatedInvoice } from "./xendit";
import type { TokenEnv } from "./token";
import { tokenForEnv } from "./token";

const GATEWAY_CREATE_PATH = "/internal/payment/create";

/** Base URL of the Ventera gateway, trailing slash trimmed. */
export function gatewayBaseUrl(): string {
  return (process.env.VENTERA_GATEWAY_URL ?? "").replace(/\/$/, "");
}

export function isGatewayConfigured(env: TokenEnv): boolean {
  return Boolean(gatewayBaseUrl() && tokenForEnv(env));
}

/**
 * Ask the gateway to create an invoice for the given environment. The gateway
 * picks the matching Xendit key set, creates the hosted invoice, and returns the
 * pay URL. `fetchImpl` is injectable for tests.
 */
export async function createInvoiceViaGateway(
  input: CreateInvoiceInput,
  env: TokenEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedInvoice> {
  const base = gatewayBaseUrl();
  const token = tokenForEnv(env);
  if (!base || !token) throw new Error(`gateway_not_configured_${env}`);

  const res = await fetchImpl(`${base}${GATEWAY_CREATE_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-token": token },
    body: JSON.stringify({
      prefix: "GOSTAY",
      environment: env,
      external_id: input.externalId,
      amount: input.amount,
      payer_email: input.payerEmail,
      description: input.description,
      success_redirect_url: input.successRedirectUrl,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`gateway_create_failed_${res.status}: ${JSON.stringify(body)}`);
  }
  return {
    id: String(body.invoice_id ?? body.id ?? ""),
    invoiceUrl: String(body.invoice_url ?? body.invoiceUrl ?? ""),
    status: String(body.status ?? "PENDING"),
    amount: Number(body.amount ?? input.amount),
    externalId: String(body.external_id ?? input.externalId),
  };
}
