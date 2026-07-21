// GET /api/admin/wa-session/<slug>/status — poll pairing status and, once the
// number is actually connected, FINALISE by writing the wa_hotel_sessions mapping
// (session_id -> tenant_id). Platform-admin only.
//
// The mapping is written here, not at onboard time, so an abandoned pairing never
// leaves live WhatsApp routing behind. Insert is idempotent (unique session_id →
// 409 on a repeat poll is treated as "already done").

import { requirePlatformAdmin } from "../../../_lib/admin/platform-auth";
import { getSessionStatus } from "../../../_lib/wa/gateway";
import { serviceGet, serviceInsert } from "../../../_lib/wa/client";
import { authHeader, slugParam, type VercelReq, type VercelRes } from "../../../_lib/admin/http";

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
}
