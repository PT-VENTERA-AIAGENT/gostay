// GET /api/admin/wa-session/<slug>/qr — proxy the gateway's QR to the admin
// browser. Platform-admin only. The gateway integration key stays server-side;
// the browser only ever sees the rendered QR data-url.

import { requirePlatformAdmin } from "../../../_lib/admin/platform-auth";
import { getSessionQr } from "../../../_lib/wa/gateway";
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
  const r = await getSessionQr(slug);
  res.status(200).json(r);
}
