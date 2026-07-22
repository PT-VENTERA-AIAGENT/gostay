// Vercel Node function: self-serve hotel creation.
//
// A signed-in user who does not yet run a hotel turns themselves into the OWNER
// of a brand-new one: create the tenant, then re-home their own profile onto it
// as `staff`. Per the role model (PRD §2.2, path 1) the web sign-in is how a new
// hotelier arrives — they are NOT dropped into someone else's hotel, and they
// are not a guest.
//
// Runs with the service_role key, which bypasses RLS AND the tenant-pin trigger
// (012) — this is exactly the sanctioned "operator re-homes a profile" path that
// trigger reserved for privileged context. The caller is authenticated by their
// OWN Supabase JWT and we only ever act on their profile id, never one from the
// request body. A hotel's role is set here to 'staff' (never 'admin' — that is
// Ventera).

import { verifySupabaseToken } from "../_lib/identity";
import { serviceConfig, serviceHeaders, serviceGet } from "../_lib/wa/client";
import {
  authHeader,
  readJson,
  toSlug,
  SLUG_RE,
  serviceDelete,
  type VercelReq,
  type VercelRes,
} from "../_lib/admin/http";

function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || undefined;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  // ── Authenticate the caller by their own Supabase token ──
  const secret = process.env.SUPABASE_JWT_SECRET;
  const token = bearer(authHeader(req));
  if (!secret || !token) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const payload = verifySupabaseToken(token, secret);
  const profileId = typeof payload?.sub === "string" ? payload.sub : undefined;
  if (!profileId) {
    res.status(401).json({ ok: false, error: "invalid_token" });
    return;
  }

  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) {
    res.status(503).json({ ok: false, error: "service_not_configured" });
    return;
  }
  const headers = serviceHeaders(serviceKey);

  // ── Validate input ──
  const body = readJson(req);
  const name = String(body.name ?? "").trim();
  const slug = toSlug(String(body.slug ?? body.name ?? ""));
  if (!name) {
    res.status(400).json({ ok: false, error: "name_required" });
    return;
  }
  if (!SLUG_RE.test(slug)) {
    res.status(400).json({ ok: false, error: "invalid_slug" });
    return;
  }

  // ── The caller must exist and not already run a hotel ──
  // Only a 'customer' (or an as-yet-unroled row) may claim a new hotel; a 'staff'
  // already belongs to one, and 'admin' is Ventera.
  const meRes = await serviceGet(
    `profiles?id=eq.${encodeURIComponent(profileId)}&select=role`,
  );
  if (!meRes.ok) {
    res.status(502).json({ ok: false, error: "lookup_failed" });
    return;
  }
  const me = ((await meRes.json()) as Array<{ role?: string }>)[0];
  if (!me) {
    res.status(403).json({ ok: false, error: "no_profile" });
    return;
  }
  if (me.role === "staff" || me.role === "admin") {
    res.status(409).json({ ok: false, error: "already_in_hotel" });
    return;
  }

  // ── Slug must be free across tenants ──
  const dupe = await serviceGet(`tenants?slug=eq.${encodeURIComponent(slug)}&select=id`);
  if (dupe.ok && ((await dupe.json()) as unknown[]).length > 0) {
    res.status(409).json({ ok: false, error: "slug_taken" });
    return;
  }

  // ── 1. Create the tenant (service-role RPC; guarded by is_privileged_context) ──
  const tenantRes = await fetch(`${url}/rest/v1/rpc/create_tenant`, {
    method: "POST",
    headers,
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

  // ── 2. Re-home the caller onto their new hotel as its owner (staff) ──
  const patch = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        tenant_id: tenantId,
        role: "staff",
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!patch.ok) {
    // Roll the tenant back so an abandoned half-create never lingers.
    await serviceDelete(`tenants?id=eq.${encodeURIComponent(tenantId)}`).catch(() => {});
    res.status(502).json({ ok: false, error: `profile_update_${patch.status}` });
    return;
  }

  res.status(200).json({ ok: true, tenantId, slug });
}
