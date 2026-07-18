// Vercel Node function: onboard a new hotel (create tenant → provision its first
// staff → create the WhatsApp gateway session). Platform-admin (Ventera) only.
//
// The wizard's step 1. Steps 2/3 (QR pairing, finalise mapping) live under
// api/admin/wa-session/[slug]/*. This endpoint creates everything EXCEPT the
// wa_hotel_sessions mapping — that is written only once the number is actually
// paired (status.ts), so an abandoned onboarding leaves no live routing.
//
// Fails closed and rolls back: if provisioning the staff or creating the gateway
// session fails, the tenant + staff created moments earlier are deleted, so a
// half-built hotel never lingers.

import { requirePlatformAdmin } from "../_lib/admin/platform-auth";
import { profileIdFor } from "../_lib/identity";
import { serviceConfig, serviceHeaders, serviceGet, serviceInsert } from "../_lib/wa/client";
import { createSession, deleteSession } from "../_lib/wa/gateway";
import { authHeader, readJson, toSlug, SLUG_RE, serviceDelete, type VercelReq, type VercelRes } from "../_lib/admin/http";

/** Mint (idempotently) a Ventera SSO account for a phone; returns its subject. */
async function provisionVentera(phone: string, displayName: string): Promise<string> {
  const url = (process.env.SSO_VENTERA_PROVISION_URL ?? "").replace(/\/$/, "");
  const key = process.env.PROVISION_API_KEY;
  if (!url || !key) throw new Error("provision_not_configured");
  const res = await fetch(`${url}/api/admin/users/provision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ phone, displayName }),
  });
  if (!res.ok) throw new Error(`ventera_${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { sub?: string };
  if (!data.sub) throw new Error("ventera_no_sub");
  return data.sub;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const guard = await requirePlatformAdmin(authHeader(req));
  if (!guard.ok) {
    res.status(guard.status).json({ ok: false, error: guard.error });
    return;
  }

  const body = readJson(req);
  const name = String(body.name ?? "").trim();
  const slug = toSlug(String(body.slug ?? body.name ?? ""));
  const staffFullName = String(body.staffFullName ?? "").trim();
  const staffEmail = String(body.staffEmail ?? "").trim() || null;
  const staffPhone = String(body.staffPhone ?? "").replace(/[^\d]/g, "");
  const botNumber = body.botNumber ? String(body.botNumber).trim() : null;

  if (!name || !staffFullName || !staffPhone) {
    res.status(400).json({ ok: false, error: "name, staffFullName and staffPhone are required" });
    return;
  }
  if (!SLUG_RE.test(slug)) {
    res.status(400).json({ ok: false, error: "invalid_slug" });
    return;
  }

  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) {
    res.status(503).json({ ok: false, error: "service_not_configured" });
    return;
  }

  // Slug must be free across tenants AND gateway sessions.
  const dupe = await serviceGet(`tenants?slug=eq.${encodeURIComponent(slug)}&select=id`);
  if (dupe.ok && ((await dupe.json()) as unknown[]).length > 0) {
    res.status(409).json({ ok: false, error: "slug_taken" });
    return;
  }

  // 1. Create the tenant (service-role RPC; guarded by is_privileged_context).
  const tenantRes = await fetch(`${url}/rest/v1/rpc/create_tenant`, {
    method: "POST",
    headers: serviceHeaders(serviceKey),
    body: JSON.stringify({ p_name: name, p_slug: slug }),
  });
  if (!tenantRes.ok) {
    res.status(502).json({ ok: false, error: `create_tenant_${tenantRes.status}` });
    return;
  }
  const created = await tenantRes.json();
  const tenant = Array.isArray(created) ? created[0] : created;
  const tenantId = tenant?.id as string | undefined;
  if (!tenantId) {
    res.status(502).json({ ok: false, error: "create_tenant_no_id" });
    return;
  }

  // 2 + 3. Provision the first staff and create the gateway session. Any failure
  // here rolls the tenant (and staff) back so nothing half-built survives.
  try {
    const sub = await provisionVentera(staffPhone, staffFullName);
    const profileId = profileIdFor(sub);
    const insert = await serviceInsert("profiles", {
      id: profileId,
      sso_sub: sub,
      email: staffEmail ?? `${staffPhone}@staff.gostay.local`,
      full_name: staffFullName,
      tenant_id: tenantId,
      role: "staff",
      is_active: true,
    });
    if (!insert.ok && insert.status !== 409) throw new Error(`staff_insert_${insert.status}`);

    const session = await createSession(slug, name);
    if (!session.ok) throw new Error(session.error ?? "session_create_failed");

    res.status(200).json({ ok: true, tenantId, slug, botNumber });
  } catch (e) {
    // Rollback, best-effort and in reverse order of creation.
    await deleteSession(slug).catch(() => {});
    await serviceDelete(`profiles?tenant_id=eq.${encodeURIComponent(tenantId)}`);
    await serviceDelete(`tenants?id=eq.${encodeURIComponent(tenantId)}`);
    res.status(502).json({ ok: false, error: `onboard_failed: ${(e as Error).message}` });
  }
}
