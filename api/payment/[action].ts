// Consolidated payment endpoints, dispatched on {action}:
//
//   POST /api/payment/create     → buat invoice untuk sebuah booking via NEXUS
//   POST /api/payment/nexus      → callback bertanda tangan HMAC dari Nexus
//   POST /api/payment/webhook    → callback gateway LAMA (x-internal-token) —
//                                  tetap hidup untuk invoice pra-migrasi
//   GET|POST /api/payment/reconcile → rekonsiliasi tarik-status dari Nexus
//
// One dynamic route (not several files) to stay within Vercel Hobby's 12-function
// cap. Thin shell: all logic lives in api/_lib/payment/*.
//
// Body parser Vercel DIMATIKAN untuk route ini: signature Nexus dihitung atas
// BYTE MENTAH body, dan parse-lalu-serialisasi-ulang mengubah byte-nya (kontrak
// Nexus §6). readRawBody menggantikannya untuk semua aksi.

import { type VercelReq, type VercelRes } from "../_lib/admin/http";
import { matchGatewayToken, safeEqual } from "../_lib/payment/token";
import {
  handleCreateInvoice,
  handleWebhook,
  handleNexusCallback,
  handleReconcile,
} from "../_lib/payment/handlers";
import { isConfigured } from "../_lib/payment/service";

export const config = { api: { bodyParser: false } };

function actionParam(req: VercelReq): string {
  const a = req.query?.action;
  return (Array.isArray(a) ? a[0] : a) ?? "";
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Body mentah sebagai string. Dengan bodyParser mati, req adalah stream Node —
 * dibaca utuh di sini. Cabang string/objek melayani unit test dan deployment
 * yang parser-nya masih menyala (objek diserialisasi ulang: cukup untuk aksi
 * legacy yang tidak memverifikasi signature; aksi nexus butuh jalur stream).
 */
async function readRawBody(req: VercelReq): Promise<string> {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body !== undefined && req.body !== null) return JSON.stringify(req.body);

  const stream = req as unknown as AsyncIterable<Buffer | string>;
  if (typeof (stream as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(chunks).toString("utf8");
  }
  return "";
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    return (JSON.parse(raw) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");

  const action = actionParam(req);
  const isReconcile = action === "reconcile";

  // Vercel cron memanggil dengan GET; aksi lain tetap POST-only.
  if (req.method !== "POST" && !(isReconcile && req.method === "GET")) {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!isConfigured()) {
    res.status(503).json({ error: "service_not_configured" });
    return;
  }

  const token = headerValue(req.headers["x-internal-token"]);

  // ── create: mint an invoice via Nexus for a booking ──
  if (action === "create") {
    if (!matchGatewayToken(token)) { res.status(401).json({ error: "unauthorized" }); return; }
    const body = parseJson(await readRawBody(req));
    const bookingReference = String(body.bookingReference ?? body.reference ?? "");
    if (!bookingReference) { res.status(400).json({ error: "missing_booking_reference" }); return; }
    const result = await handleCreateInvoice({
      bookingReference,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      successRedirectUrl: typeof body.successRedirectUrl === "string" ? body.successRedirectUrl : undefined,
    });
    if (result.ok === false) { res.status(result.status).json({ error: result.error }); return; }
    res.status(200).json({
      ok: true, invoiceUrl: result.invoiceUrl, invoiceId: result.invoiceId,
      amount: result.amount, mode: result.mode,
    });
    return;
  }

  // ── nexus: settlement callback dari Ventera-Nexus (auth = signature HMAC) ──
  if (action === "nexus") {
    const result = await handleNexusCallback({
      rawBody: await readRawBody(req),
      timestamp: headerValue(req.headers["x-nexus-timestamp"]),
      signature: headerValue(req.headers["x-nexus-signature"]),
    });
    if (result.ok === false) { res.status(result.status).json({ error: result.error }); return; }
    res.status(result.status).json({ ok: true, outcome: result.outcome });
    return;
  }

  // ── reconcile: jaring pengaman — callback mempercepat, ini yang menjamin ──
  if (isReconcile) {
    // Dua kunci yang sah: token internal (operator/platform) atau CRON_SECRET
    // (Vercel cron menyisipkannya sebagai bearer bila env-nya di-set).
    const bearer = headerValue(req.headers["authorization"]);
    const cronOk =
      Boolean(process.env.CRON_SECRET) &&
      safeEqual(bearer, `Bearer ${process.env.CRON_SECRET}`);
    if (!matchGatewayToken(token) && !cronOk) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const results = await handleReconcile();
    res.status(200).json({ ok: true, results });
    return;
  }

  // ── webhook: settlement callback gateway LAMA (auth inside handler) ──
  if (action === "webhook") {
    const result = await handleWebhook(token, parseJson(await readRawBody(req)));
    if (result.ok === false) { res.status(result.status).json({ error: result.error }); return; }
    res.status(result.status).json({ ok: true, outcome: result.outcome });
    return;
  }

  res.status(404).json({ error: "unknown_action" });
}
