// Self-service WhatsApp linking for a hotel — the Chatly-style flow, but proxied
// through GoStay so the operator never touches the wa-ventera gateway admin.
//
//   POST   /api/wa/connect  → create/refresh the gateway session for my hotel (pair)
//   GET    /api/wa/connect  → poll: { status, qr?, connected, linkedNumber? }
//   DELETE /api/wa/connect  → unlink (logout the gateway session, deactivate mapping)
//
// Gated to staff (their own hotel) OR admin (Ventera). The session id is the
// hotel's tenant slug — the same id wa_hotel_sessions maps back to the tenant, so
// the inbound webhook keeps resolving tenant from sessionId exactly as before.

import QRCode from "qrcode";
import { requireTenantMember } from "../_lib/admin/tenant-auth";
import { serviceConfig, serviceHeaders, serviceGet } from "../_lib/wa/client";
import { createSession, getSessionQr, getSessionStatus, deleteSession } from "../_lib/wa/gateway";
import { authHeader, readJson, type VercelReq, type VercelRes } from "../_lib/admin/http";

/**
 * wa-ventera emits the raw Baileys QR payload (sometimes wrapped as {"qr":"..."})
 * rather than an image. Unwrap it and render it to a data-url PNG so the browser
 * can show it with a plain <img>, no client-side QR library needed.
 */
async function toQrImage(raw: string): Promise<string | null> {
  let payload = raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.qr === "string") payload = parsed.qr;
  } catch {
    /* not JSON — use as-is */
  }
  if (payload.startsWith("data:image")) return payload; // already an image
  try {
    return await QRCode.toDataURL(payload, { width: 320, margin: 1 });
  } catch {
    return null;
  }
}

type UiStatus = "none" | "pairing" | "qr" | "connecting" | "open" | "closed";

function mapStatus(raw: string | undefined, connected: boolean): UiStatus {
  if (connected) return "open";
  const s = (raw ?? "").toLowerCase();
  if (s.includes("qr")) return "qr";
  if (s.includes("connect")) return "connecting";
  if (s.includes("pair") || s.includes("init") || s.includes("start")) return "pairing";
  if (s.includes("close") || s.includes("logout") || s.includes("disconnect")) return "closed";
  if (!s || s.includes("not_found") || s.includes("not_configured") || s === "unknown") return "none";
  return "pairing";
}

/** The hotel's slug (= gateway session id) and display name. */
async function tenantSlug(tenantId: string): Promise<{ slug: string; name: string } | null> {
  const res = await serviceGet(`tenants?id=eq.${encodeURIComponent(tenantId)}&select=slug,name`);
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ slug: string; name: string }>;
  return rows[0] ?? null;
}

async function upsertMapping(
  slug: string,
  tenantId: string,
  isActive: boolean,
  botNumber?: string,
): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) return;
  await fetch(`${url}/rest/v1/wa_hotel_sessions?on_conflict=session_id`, {
    method: "POST",
    headers: { ...serviceHeaders(serviceKey), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      session_id: slug,
      tenant_id: tenantId,
      is_active: isActive,
      ...(botNumber ? { bot_number: botNumber } : {}),
    }),
  }).catch(() => {});
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");

  const method = req.method ?? "GET";
  // Admin may target a specific hotel via ?tenantId= or body.tenantId; staff can't.
  const requestedTenant =
    (req.query?.tenantId as string | undefined) ??
    (method === "POST" || method === "DELETE" ? (readJson(req).tenantId as string | undefined) : undefined);

  const guard = await requireTenantMember(authHeader(req), requestedTenant);
  if (guard.ok === false) {
    res.status(guard.status).json({ ok: false, error: guard.error });
    return;
  }
  const { tenantId } = guard.member;

  const t = await tenantSlug(tenantId);
  if (!t) {
    res.status(404).json({ ok: false, error: "tenant_not_found" });
    return;
  }
  const slug = t.slug;

  try {
    if (method === "POST") {
      // Best-effort: a session with this id may already exist (reconnect). The
      // gateway's start is idempotent, and polling GET is the real driver of the
      // UI, so we don't hard-fail here — we just log a genuine gateway error.
      const created = await createSession(slug, t.name);
      if (!created.ok) console.error("[wa/connect] createSession:", created.error);
      res.status(200).json({ ok: true, sessionId: slug });
      return;
    }

    if (method === "DELETE") {
      await deleteSession(slug).catch(() => {});
      await upsertMapping(slug, tenantId, false);
      res.status(200).json({ ok: true });
      return;
    }

    // GET — poll status + QR.
    const st = await getSessionStatus(slug);
    if (st.connected) {
      await upsertMapping(slug, tenantId, true, st.number); // finalise + store bot number
      res.status(200).json({ status: "open", connected: true, linkedNumber: st.number ?? null });
      return;
    }
    const qr = await getSessionQr(slug);
    if (qr.qr) {
      const image = await toQrImage(qr.qr);
      if (image) {
        res.status(200).json({ status: "qr", qr: image, connected: false });
        return;
      }
    }
    res.status(200).json({ status: mapStatus(st.status || qr.status, false), connected: false });
  } catch (err) {
    console.error("[wa/connect] error:", (err as Error).message);
    res.status(200).json({ status: "none", connected: false, error: "gateway_error" });
  }
}
