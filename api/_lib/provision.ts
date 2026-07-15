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
  /** Seeds the role on first login only. */
  initialRole: AppRole;
}

export interface ProvisionResult {
  ok: boolean;
  created: boolean;
  /** The role now in the database, which may differ from initialRole. */
  role: AppRole | null;
  error?: string;
}

function config() {
  return {
    url: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, ""),
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function provisioningEnabled(): boolean {
  const { url, serviceKey } = config();
  return Boolean(url && serviceKey);
}

export async function provisionProfile(input: ProvisionInput): Promise<ProvisionResult> {
  const { url, serviceKey } = config();
  if (!url || !serviceKey) {
    return { ok: false, created: false, role: null, error: "provisioning_not_configured" };
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const existing = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(input.profileId)}&select=id,role`,
    { headers },
  );
  if (!existing.ok) {
    return { ok: false, created: false, role: null, error: `lookup_failed_${existing.status}` };
  }

  const rows = (await existing.json()) as Array<{ id: string; role: AppRole }>;

  if (rows.length > 0) {
    // The row is already there. Refresh the contact fields, but leave `role`
    // alone: an admin may have promoted or demoted this user in User
    // Management, and that decision must outlive the next login.
    const patch = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(input.profileId)}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        email: input.email,
        full_name: input.fullName,
        sso_sub: input.ssoSub,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!patch.ok) {
      // Not fatal: the profile exists, so the session is still usable.
      return { ok: true, created: false, role: rows[0].role, error: `update_failed_${patch.status}` };
    }
    return { ok: true, created: false, role: rows[0].role };
  }

  const insert = await fetch(`${url}/rest/v1/profiles`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      id: input.profileId,
      sso_sub: input.ssoSub,
      email: input.email,
      full_name: input.fullName,
      role: input.initialRole,
    }),
  });

  if (!insert.ok) {
    return { ok: false, created: false, role: null, error: `insert_failed_${insert.status}` };
  }

  const created = (await insert.json()) as Array<{ role: AppRole }>;
  return { ok: true, created: true, role: created[0]?.role ?? input.initialRole };
}
