import type { AppRole } from "./identity";

/**
 * Ensures a profiles row exists for an SSO identity.
 *
 * Runs with the service_role key, which bypasses RLS — deliberately. profiles
 * must not be self-insertable, or a guest could mint themselves an admin row,
 * which is exactly the class of hole this whole change exists to close.
 */

export interface ProvisionInput {
  profileId: string;
  ssoSub: string;
  email: string;
  fullName: string;
  /** ISO timestamp for last_seen_at, passed in so it matches the token's iat. */
  now: string;
}

export interface ProvisionResult {
  ok: boolean;
  created: boolean;
  /** The role as stored in the database — the only role that means anything. */
  role: AppRole | null;
  /** False when an admin has deactivated this user. */
  isActive: boolean;
  error?: string;
}

/**
 * Same shape as ProvisionInput, but the tenant is passed DIRECTLY rather than
 * resolved from the server's TENANT_SLUG.
 *
 * The web sign-in flow (provisionProfile) files a profile under the single
 * hotel this deployment serves, read from the TENANT_SLUG env. The WhatsApp
 * flow can't: a message's hotel is decided by the sessionId it arrived on, not
 * by any server env, and one webhook serves many hotels. So the caller resolves
 * the tenant (from wa_hotel_sessions) and hands it in explicitly here.
 */
export interface ProvisionWithTenantInput {
  profileId: string;
  ssoSub: string;
  /** The hotel this profile belongs to — resolved by the caller, not from env. */
  tenantId: string;
  /** Optional: a WhatsApp guest may have no email. */
  email?: string;
  fullName: string;
  /** ISO timestamp for last_seen_at. */
  now: string;
}

function config() {
  return {
    url: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, ""),
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    // Which hotel a newly-provisioned profile belongs to. Read from the SERVER
    // env, not from any client input: the tenant a profile is filed under is a
    // security boundary, so it must not be spoofable by the browser that calls
    // /api/sso/token. Left unset on a single-hotel deployment — the DB's
    // default_tenant() (014) then fills it, and fails closed once a second
    // hotel exists.
    tenantSlug: (process.env.TENANT_SLUG ?? "").trim(),
  };
}

/**
 * The tenant id for a new profile, resolved from the server's TENANT_SLUG.
 *
 * Returns undefined when TENANT_SLUG is unset — the caller then omits tenant_id
 * and the column default takes over. Returns null when a slug is configured but
 * matches no active tenant: a misconfiguration that must fail the sign-in
 * rather than silently file the user under whatever the default happens to be.
 */
async function resolveTenantId(
  url: string,
  headers: Record<string, string>,
  slug: string,
): Promise<string | null | undefined> {
  if (!slug) return undefined;
  const res = await fetch(
    `${url}/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id`,
    { headers },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export function provisioningEnabled(): boolean {
  const { url, serviceKey } = config();
  return Boolean(url && serviceKey);
}

export async function provisionProfile(input: ProvisionInput): Promise<ProvisionResult> {
  // A network failure here must not take the whole sign-in down with it. fetch
  // rejects on DNS failures, refused connections and timeouts, none of which
  // the per-response `.ok` checks below would ever see.
  try {
    return await runProvision(input);
  } catch (e) {
    return {
      ok: false,
      created: false,
      role: null,
      isActive: false,
      error: `network_error: ${(e as Error).message}`,
    };
  }
}

/**
 * Provisions a profile with the tenant handed in directly.
 *
 * The WhatsApp booking webhook resolves a message's hotel from its sessionId
 * (never from env), then hands that tenant here. Otherwise identical to the web
 * sign-in path: a service-role lookup-then-insert/patch that never sends `role`
 * (the column defaults to 'customer'; authorization lives in the database).
 */
export async function provisionProfileWithTenant(input: ProvisionWithTenantInput): Promise<ProvisionResult> {
  // Same fail-soft contract as provisionProfile: a DNS failure / refused
  // connection rejects the fetch, which the per-response .ok checks never see.
  try {
    return await upsertProfile(
      {
        profileId: input.profileId,
        ssoSub: input.ssoSub,
        email: input.email,
        fullName: input.fullName,
        now: input.now,
      },
      // The tenant is already known — no TENANT_SLUG resolution, no lookup.
      async () => ({ ok: true, tenantId: input.tenantId }),
    );
  } catch (e) {
    return {
      ok: false,
      created: false,
      role: null,
      isActive: false,
      error: `network_error: ${(e as Error).message}`,
    };
  }
}

async function runProvision(input: ProvisionInput): Promise<ProvisionResult> {
  return upsertProfile(input, async ({ url, headers }) => {
    // Resolve the tenant only when creating the row. A configured-but-unknown
    // slug is a deployment error: fail the provision rather than let the DB
    // default quietly file the user under the wrong hotel.
    const { tenantSlug } = config();
    const tenantId = await resolveTenantId(url, headers, tenantSlug);
    if (tenantId === null && tenantSlug) {
      return { ok: false, error: `unknown_tenant_slug_${tenantSlug}` };
    }
    // undefined → tenant_id omitted, column default (single-hotel) applies.
    return { ok: true, tenantId: tenantId ?? undefined };
  });
}

/** The subset of profile fields both provisioning paths write. */
interface ProfileFields {
  profileId: string;
  ssoSub: string;
  /** Optional so the WhatsApp path (a guest with no email) can omit it. */
  email?: string;
  fullName: string;
  now: string;
}

/** Where a new profile row is filed, resolved lazily so a returning login skips it. */
type TenantResolution = { ok: true; tenantId: string | undefined } | { ok: false; error: string };

/**
 * The shared service-role lookup-then-insert/patch for a profiles row.
 *
 * `resolveTenant` is invoked ONLY on the insert path — never for a returning
 * user — so the web flow keeps its behaviour of hitting `tenants` only on first
 * login. It decides which tenant a NEW row is filed under (or errors out).
 */
async function upsertProfile(
  input: ProfileFields,
  resolveTenant: (ctx: { url: string; headers: Record<string, string> }) => Promise<TenantResolution>,
): Promise<ProvisionResult> {
  const { url, serviceKey } = config();
  if (!url || !serviceKey) {
    return { ok: false, created: false, role: null, isActive: false, error: "provisioning_not_configured" };
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const existing = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(input.profileId)}&select=id,role,is_active`,
    { headers },
  );
  if (!existing.ok) {
    return { ok: false, created: false, role: null, isActive: false, error: `lookup_failed_${existing.status}` };
  }

  const rows = (await existing.json()) as Array<{ id: string; role: AppRole; is_active: boolean }>;

  if (rows.length > 0) {
    // The row is already there. Refresh the contact fields, but never touch
    // `role`: it is owned by the database, and an admin's decision to promote
    // or demote must outlive every subsequent login.
    const patch = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(input.profileId)}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        // email is only refreshed when we actually have one — a WhatsApp guest
        // sign-in must not blank out an email a web login previously set.
        ...(input.email !== undefined ? { email: input.email } : {}),
        full_name: input.fullName,
        sso_sub: input.ssoSub,
        last_seen_at: input.now,
        updated_at: input.now,
      }),
    });
    if (!patch.ok) {
      // Not fatal: the profile exists, so the session is still usable.
      return {
        ok: true, created: false,
        role: rows[0].role, isActive: rows[0].is_active !== false,
        error: `update_failed_${patch.status}`,
      };
    }
    return { ok: true, created: false, role: rows[0].role, isActive: rows[0].is_active !== false };
  }

  const tenant = await resolveTenant({ url, headers });
  if (!tenant.ok) {
    return { ok: false, created: false, role: null, isActive: false, error: tenant.error };
  }

  // `role` is deliberately absent: the column defaults to 'customer', so a new
  // arrival gets the least privilege and is promoted later through the database.
  // Sending a role here would let the SSO token influence authorization.
  const insert = await fetch(`${url}/rest/v1/profiles`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      id: input.profileId,
      sso_sub: input.ssoSub,
      ...(input.email !== undefined ? { email: input.email } : {}),
      full_name: input.fullName,
      last_seen_at: input.now,
      // Omitted when the resolver returns undefined (single-hotel web install),
      // so the column default applies; sent explicitly otherwise.
      ...(tenant.tenantId ? { tenant_id: tenant.tenantId } : {}),
    }),
  });

  if (!insert.ok) {
    return { ok: false, created: false, role: null, isActive: false, error: `insert_failed_${insert.status}` };
  }

  const created = (await insert.json()) as Array<{ role: AppRole; is_active: boolean }>;
  return {
    ok: true, created: true,
    role: created[0]?.role ?? null,
    isActive: created[0]?.is_active !== false,
  };
}
