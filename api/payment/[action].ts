// Consolidated payment endpoints, dispatched on {action}:
//
//   POST /api/payment/create   → ask the gateway to create an invoice for a booking
//   POST /api/payment/webhook  → settlement callback from the gateway (records payment)
//
// One dynamic route (not several files) to stay within Vercel Hobby's 12-function
// cap. Thin shell: all logic lives in api/_lib/payment/*.
//
// Auth (gateway model): both actions authenticate with the environment internal
// token (production/sandbox) the gateway is registered with — the same
// `x-internal-token` scheme as Storo's confirm endpoint. Xendit keys live in the
// gateway, never here. The per-hotel live/test toggle is set by the Ventera
// super admin in the app (Supabase + RLS), not through this route.

import { readJson, type VercelReq, type VercelRes } from "../_lib/admin/http";
import { matchGatewayToken } from "../_lib/payment/token";
import { handleCreateInvoice, handleWebhook } from "../_lib/payment/handlers";
import { isConfigured } from "../_lib/payment/service";

function actionParam(req: VercelReq): string {
  const a = req.query?.action;
  return (Array.isArray(a) ? a[0] : a) ?? "";
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!isConfigured()) {
    res.status(503).json({ error: "service_not_configured" });
    return;
  }

  const action = actionParam(req);
  const token = headerValue(req.headers["x-internal-token"]);

  // ── create: mint an invoice via the gateway for a booking ──
  if (action === "create") {
    if (!matchGatewayToken(token)) { res.status(401).json({ error: "unauthorized" }); return; }
    const body = readJson(req);
    const bookingReference = String(body.bookingReference ?? body.reference ?? "");
    if (!bookingReference) { res.status(400).json({ error: "missing_booking_reference" }); return; }
    const result = await handleCreateInvoice({
      bookingReference,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      successRedirectUrl: typeof body.successRedirectUrl === "string" ? body.successRedirectUrl : undefined,
    });
    if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
    res.status(200).json({
      ok: true, invoiceUrl: result.invoiceUrl, invoiceId: result.invoiceId,
      amount: result.amount, mode: result.mode,
    });
    return;
  }

  // ── webhook: settlement callback from the gateway (auth inside handler) ──
  if (action === "webhook") {
    const result = await handleWebhook(token, readJson(req));
    if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
    res.status(result.status).json({ ok: true, outcome: result.outcome });
    return;
  }

  res.status(404).json({ error: "unknown_action" });
}
