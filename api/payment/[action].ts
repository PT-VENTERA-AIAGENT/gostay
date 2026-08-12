// Consolidated payment endpoints, dispatched on {action}:
//
//   POST /api/payment/create                → invoice untuk pesanan (jalur WhatsApp)
//   POST /api/payment/checkout              → tamu membayar pesanannya sendiri
//   POST /api/payment/subscription-checkout → hotel membayar langganannya ke Ventera
//   POST /api/payment/webhook               → callback settlement (kedua jenis tagihan)
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
import { handleSubscriptionCheckout } from "../_lib/payment/subscription";
import { isConfigured, bookingOwnerProfileId } from "../_lib/payment/service";
import { verifySupabaseToken } from "../_lib/identity";

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
    if (result.ok === false) { res.status(result.status).json({ error: result.error }); return; }
    res.status(200).json({
      ok: true, invoiceUrl: result.invoiceUrl, invoiceId: result.invoiceId,
      amount: result.amount, mode: result.mode,
    });
    return;
  }

  // ── checkout: seorang TAMU membayar pesanannya sendiri dari portal ──
  //
  // Sampai sekarang invoice hanya bisa lahir dari jalur WhatsApp, karena
  // `create` dijaga token internal — rahasia server yang tidak boleh dipegang
  // peramban. Akibatnya portal web menampilkan "Pending" tanpa satu pun cara
  // membayarnya. Aksi ini menutup itu, dan sengaja TIDAK memakai token internal:
  // tamu membuktikan dirinya dengan token Supabase-nya sendiri — token yang sama
  // yang menjaga setiap policy RLS-nya.
  //
  // Kepemilikan diperiksa di server dengan service key, bukan disimpulkan dari
  // nomor pesanan yang dikirim. Tanpa itu, siapa pun yang menebak sebuah
  // `reference` bisa menerbitkan invoice atas pesanan orang lain.
  if (action === "checkout") {
    const secret = process.env.SUPABASE_JWT_SECRET;
    const auth = headerValue(req.headers.authorization) ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!secret || !jwt) { res.status(401).json({ error: "unauthorized" }); return; }

    const claims = verifySupabaseToken(jwt, secret);
    // verifySupabaseToken hanya memeriksa tanda tangan. Token kedaluwarsa tetap
    // bertanda tangan sah, jadi masa berlakunya diperiksa di sini — kalau tidak,
    // sesi lama yang bocor berlaku selamanya.
    const exp = typeof claims?.exp === "number" ? claims.exp : 0;
    const sub = typeof claims?.sub === "string" ? claims.sub : "";
    if (!claims || !sub || exp * 1000 <= Date.now()) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const body = readJson(req);
    const bookingReference = String(body.bookingReference ?? body.reference ?? "");
    if (!bookingReference) { res.status(400).json({ error: "missing_booking_reference" }); return; }

    let owner: string | null;
    try {
      owner = await bookingOwnerProfileId(bookingReference);
    } catch (e) {
      // Dicatat, bukan ditelan: tanpa ini kegagalan pembacaan tampil sebagai
      // 502 tanpa sebab, dan satu-satunya cara mencarinya adalah menebak.
      // Pesannya TIDAK dikirim ke pemanggil — ia menyebut bentuk data internal.
      console.error("[payment/checkout] gagal membaca pemilik pesanan:", e);
      res.status(502).json({ error: "booking_lookup_failed" });
      return;
    }
    // Pesanan yang tidak ada dan pesanan milik orang lain dijawab sama —
    // membedakannya akan mengubah endpoint ini jadi alat menebak nomor pesanan.
    if (!owner || owner !== sub) { res.status(404).json({ error: "booking_not_found" }); return; }

    const result = await handleCreateInvoice({
      bookingReference,
      // Jumlahnya TIDAK diambil dari permintaan. Yang menentukan sisa tagihan
      // adalah pesanan di database; menerima `amount` dari peramban berarti
      // membiarkan tamu menetapkan harganya sendiri.
      successRedirectUrl:
        typeof body.successRedirectUrl === "string" ? body.successRedirectUrl : undefined,
    });
    if (result.ok === false) { res.status(result.status).json({ error: result.error }); return; }
    res.status(200).json({
      ok: true, invoiceUrl: result.invoiceUrl, invoiceId: result.invoiceId,
      amount: result.amount, mode: result.mode,
    });
    return;
  }

  // ── subscription-checkout: HOTEL membayar tagihan langganannya sendiri ──
  //
  // Uangnya untuk Ventera, bukan untuk hotel — tapi yang menekan tombolnya orang
  // hotel, jadi pembuktian dirinya sama seperti `checkout`: token Supabase-nya
  // sendiri, bukan token internal. Hotel pemilik tagihan ditentukan di server
  // dari profil si pemanggil; `tenant_id` dari peramban tidak pernah dipercaya.
  if (action === "subscription-checkout") {
    const secret = process.env.SUPABASE_JWT_SECRET;
    const auth = headerValue(req.headers.authorization) ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!secret || !jwt) { res.status(401).json({ error: "unauthorized" }); return; }

    const claims = verifySupabaseToken(jwt, secret);
    const exp = typeof claims?.exp === "number" ? claims.exp : 0;
    const sub = typeof claims?.sub === "string" ? claims.sub : "";
    if (!claims || !sub || exp * 1000 <= Date.now()) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const body = readJson(req);
    const invoiceId = Number(body.invoiceId);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      res.status(400).json({ error: "missing_invoice_id" });
      return;
    }

    let result;
    try {
      result = await handleSubscriptionCheckout({
        invoiceId,
        profileId: sub,
        successRedirectUrl:
          typeof body.successRedirectUrl === "string" ? body.successRedirectUrl : undefined,
      });
    } catch (e) {
      // Kegagalan Xendit (kunci belum diisi, nominal di bawah minimum) muncul
      // sebagai lemparan. Dicatat di server; pemanggil hanya dapat kode umum.
      console.error("[payment/subscription-checkout] gagal menerbitkan tagihan:", e);
      res.status(502).json({ error: "invoice_create_failed" });
      return;
    }
    if (result.ok === false) { res.status(result.status).json({ error: result.error }); return; }
    res.status(200).json({
      ok: true, invoiceUrl: result.invoiceUrl, invoiceId: result.invoiceId,
      amount: result.amount, mode: result.mode, reused: result.reused,
    });
    return;
  }

  // ── webhook: settlement callback from the gateway (auth inside handler) ──
  if (action === "webhook") {
    const result = await handleWebhook(token, readJson(req));
    if (result.ok === false) { res.status(result.status).json({ error: result.error }); return; }
    res.status(result.status).json({ ok: true, outcome: result.outcome });
    return;
  }

  res.status(404).json({ error: "unknown_action" });
}
