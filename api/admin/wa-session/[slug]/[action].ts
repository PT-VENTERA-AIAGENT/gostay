// Consolidated hotel WhatsApp-pairing endpoints, dispatched on {action}:
//
//   GET  /api/admin/wa-session/<slug>/qr      → proxy the gateway's QR
//   GET  /api/admin/wa-session/<slug>/status  → poll pairing; finalise mapping when connected
//   POST /api/admin/wa-session/<slug>/cancel  → abandon onboarding (rollback an empty hotel)
//
// Three thin endpoints were merged into this one dynamic route so the whole app
// stays within Vercel Hobby's 12-Serverless-Function-per-deployment cap. The URLs
// the onboarding wizard calls are unchanged. Platform-admin only throughout.

import { requirePlatformAdmin } from "../../../_lib/admin/platform-auth";
import { getSessionQr, getSessionStatus, deleteSession } from "../../../_lib/wa/gateway";
import { serviceGet, serviceInsert } from "../../../_lib/wa/client";
import { authHeader, slugParam, serviceDelete, type VercelReq, type VercelRes } from "../../../_lib/admin/http";

function actionParam(req: VercelReq): string {
  const a = req.query?.action;
  return (Array.isArray(a) ? a[0] : a) ?? "";
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");

  const guard = await requirePlatformAdmin(authHeader(req));
  if (!guard.ok) {
    res.status(guard.status).json({ error: guard.error });
    return;
  }
  const slug = slugParam(req);
  if (!slug) {
    res.status(400).json({ error: "missing_slug" });
    return;
  }
  const action = actionParam(req);

  // ── qr: proxy the gateway's QR to the admin browser ──
  if (action === "qr") {
    const r = await getSessionQr(slug);
    res.status(200).json(r);
    return;
  }

  // ── status: poll pairing; once connected, FINALISE the wa_hotel_sessions map ──
  // Written here (not at onboard time) so an abandoned pairing never leaves live
  // WhatsApp routing behind. Insert is idempotent (409 on a repeat poll = done).
  if (action === "status") {
    const st = await getSessionStatus(slug);
    let done = false;
    if (st.connected) {
      const tRes = await serviceGet(`tenants?slug=eq.${encodeURIComponent(slug)}&select=id`);
      const rows = tRes.ok ? ((await tRes.json()) as Array<{ id: string }>) : [];
      const tenantId = rows[0]?.id;
      if (tenantId) {
        const ins = await serviceInsert("wa_hotel_sessions", {
          session_id: slug,
          tenant_id: tenantId,
          is_active: true,
        });
        done = ins.ok || ins.status === 409;
      }
    }
    res.status(200).json({ status: st.status, connected: st.connected, done });
    return;
  }

  // ── cancel: abandon an in-progress onboarding, rolling back an EMPTY hotel ──
  if (action === "cancel") {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }
    await deleteSession(slug).catch(() => {});

    const tRes = await serviceGet(`tenants?slug=eq.${encodeURIComponent(slug)}&select=id`);
    const rows = tRes.ok ? ((await tRes.json()) as Array<{ id: string }>) : [];
    const tenantId = rows[0]?.id;

    if (tenantId) {
      // Safety valve: only a still-empty hotel is rolled back, so a cancel can
      // never nuke a hotel that already has bookings.
      const bk = await serviceGet(`bookings?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id&limit=1`);
      const hasBookings = bk.ok && ((await bk.json()) as unknown[]).length > 0;
      if (!hasBookings) {
        await serviceDelete(`wa_hotel_sessions?session_id=eq.${encodeURIComponent(slug)}`);
        await serviceDelete(`profiles?tenant_id=eq.${encodeURIComponent(tenantId)}`);
        await serviceDelete(`tenants?id=eq.${encodeURIComponent(tenantId)}`);
      }
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(404).json({ error: "unknown_action" });
}
