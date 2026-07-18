// Platform-admin (Ventera) authorization guard for serverless admin endpoints.
//
// GoStay has three application roles, all stored in profiles.role (the only
// source of truth — see api/_lib/identity.ts):
//   admin    = the Ventera platform operator; the ONLY admin, sees every hotel.
//   staff    = per-hotel employee.
//   customer = guest.
//
// Platform-only endpoints (hotel onboarding and the like) must be reachable by
// role='admin' alone. The browser presents a Supabase-compatible HS256 JWT
// whose `sub` is profiles.id; we verify it, then confirm — with the service_role
// key, bypassing RLS — that the profile is an active admin.
//
// This is a security boundary: every step fails closed, and the function never
// throws. Any uncertainty (missing header, bad token, unreachable database,
// unexpected shape) resolves to a denial, not an allow.

import { verifySupabaseToken } from "../identity";
import { serviceGet } from "../wa/client";

export interface PlatformAdmin {
  profileId: string;
}

export type GuardResult =
  | { ok: true; admin: PlatformAdmin }
  | { ok: false; status: number; error: string };

/** The subset of a profiles row this guard reads. */
interface ProfileRow {
  role?: string;
  is_active?: boolean;
}

/**
 * Extracts the token from an `Authorization: Bearer <token>` header.
 *
 * Returns undefined for anything that is not a non-empty bearer token, so the
 * caller fails closed on a missing or malformed header.
 */
function bearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  const token = match?.[1]?.trim();
  return token ? token : undefined;
}

/**
 * Resolves the caller to a platform admin, or an HTTP-shaped denial.
 *
 * @param authorizationHeader the raw `Authorization` request header, if any.
 */
export async function requirePlatformAdmin(
  authorizationHeader: string | undefined,
): Promise<GuardResult> {
  try {
    const token = bearerToken(authorizationHeader);
    if (!token) return { ok: false, status: 401, error: "missing_token" };

    // verifySupabaseToken needs a string secret. A missing secret means we
    // cannot verify anything — treat it as an invalid token, never a bypass.
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) return { ok: false, status: 401, error: "invalid_token" };

    const payload = verifySupabaseToken(token, secret);
    const profileId = typeof payload?.sub === "string" ? payload.sub : undefined;
    if (!profileId) return { ok: false, status: 401, error: "invalid_token" };

    // Service-role lookup — bypasses RLS, so it sees the row regardless of who
    // the token belongs to. A non-2xx response, or no matching row, denies.
    const res = await serviceGet(
      `profiles?id=eq.${encodeURIComponent(profileId)}&select=role,is_active`,
    );
    if (!res.ok) return { ok: false, status: 403, error: "not_authorized" };

    const rows = (await res.json()) as ProfileRow[];
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row) return { ok: false, status: 403, error: "not_authorized" };

    // is_active !== false so a row that omits the column (defaults true) still
    // passes; only an explicit false locks the admin out.
    if (row.role !== "admin" || row.is_active === false) {
      return { ok: false, status: 403, error: "not_platform_admin" };
    }

    return { ok: true, admin: { profileId } };
  } catch {
    // Any unexpected failure — DNS error, refused connection, malformed JSON,
    // an unconfigured service client (serviceGet throws) — is a denial.
    return { ok: false, status: 403, error: "not_authorized" };
  }
}
