// Tenant-scoped guard for the self-service WhatsApp linking endpoints.
//
// Unlike requirePlatformAdmin (Ventera-only), this admits BOTH `staff` (managing
// their OWN hotel) and `admin` (Ventera, any hotel) — no new role. It resolves
// WHICH tenant the caller may act on:
//   - staff  → their own profiles.tenant_id, always (a passed tenantId is ignored,
//              so a hotel's staff can never manage another hotel's WhatsApp).
//   - admin  → a requested tenantId if given, else their own tenant.
//
// Fail-closed at every step (mirrors platform-auth.ts): deny by default, never throw.

import { verifySupabaseToken } from "../identity";
import { serviceGet } from "../wa/client";

export interface TenantMember {
  profileId: string;
  tenantId: string;
  role: "staff" | "admin";
}
export type TenantGuard =
  | { ok: true; member: TenantMember }
  | { ok: false; status: number; error: string };

export async function requireTenantMember(
  authorizationHeader: string | undefined,
  requestedTenantId?: string,
): Promise<TenantGuard> {
  try {
    const token =
      authorizationHeader && authorizationHeader.startsWith("Bearer ")
        ? authorizationHeader.slice(7)
        : "";
    if (!token) return { ok: false, status: 401, error: "missing_token" };

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) return { ok: false, status: 401, error: "invalid_token" };
    const payload = verifySupabaseToken(token, secret);
    const profileId = payload && typeof payload.sub === "string" ? payload.sub : null;
    if (!profileId) return { ok: false, status: 401, error: "invalid_token" };

    const res = await serviceGet(
      `profiles?id=eq.${encodeURIComponent(profileId)}&select=role,is_active,tenant_id`,
    );
    if (!res.ok) return { ok: false, status: 403, error: "not_authorized" };
    const rows = (await res.json()) as Array<{
      role?: string;
      is_active?: boolean;
      tenant_id?: string;
    }>;
    const me = rows[0];
    if (!me || me.is_active === false) return { ok: false, status: 403, error: "not_authorized" };
    if (me.role !== "staff" && me.role !== "admin") {
      return { ok: false, status: 403, error: "not_authorized" };
    }

    // Tenant resolution — staff are pinned to their own hotel.
    let tenantId: string | undefined;
    if (me.role === "admin") {
      tenantId = (requestedTenantId && requestedTenantId.trim()) || me.tenant_id;
    } else {
      tenantId = me.tenant_id; // staff: own hotel only
    }
    if (!tenantId) return { ok: false, status: 400, error: "tenant_unresolved" };

    return { ok: true, member: { profileId, tenantId, role: me.role } };
  } catch {
    return { ok: false, status: 403, error: "not_authorized" };
  }
}
