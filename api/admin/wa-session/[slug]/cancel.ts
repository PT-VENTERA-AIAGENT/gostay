// POST /api/admin/wa-session/<slug>/cancel — abandon an in-progress onboarding.
// Platform-admin only. Deletes the gateway session and rolls back the tenant it
// belongs to (mapping, staff, tenant) — but ONLY when that tenant has no bookings
// yet, so a cancel can never nuke a hotel that is already live.

import { requirePlatformAdmin } from "../../../_lib/admin/platform-auth";
import { deleteSession } from "../../../_lib/wa/gateway";
import { serviceGet } from "../../../_lib/wa/client";
import { authHeader, slugParam, serviceDelete, type VercelReq, type VercelRes } from "../../../_lib/admin/http";

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
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

  await deleteSession(slug).catch(() => {});

  const tRes = await serviceGet(`tenants?slug=eq.${encodeURIComponent(slug)}&select=id`);
  const rows = tRes.ok ? ((await tRes.json()) as Array<{ id: string }>) : [];
  const tenantId = rows[0]?.id;

  if (tenantId) {
    // Safety valve: only a still-empty hotel is rolled back.
    const bk = await serviceGet(`bookings?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id&limit=1`);
    const hasBookings = bk.ok && ((await bk.json()) as unknown[]).length > 0;
    if (!hasBookings) {
      await serviceDelete(`wa_hotel_sessions?session_id=eq.${encodeURIComponent(slug)}`);
      await serviceDelete(`profiles?tenant_id=eq.${encodeURIComponent(tenantId)}`);
      await serviceDelete(`tenants?id=eq.${encodeURIComponent(tenantId)}`);
    }
  }

  res.status(200).json({ ok: true });
}
