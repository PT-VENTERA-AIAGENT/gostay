import { supabase } from "@/lib/supabase";
import type { Profile, ProfileUpdate, UserRole } from "@/types/database.types";

/**
 * Users are not created here. A profile row appears when someone signs in
 * through Ventera SSO for the first time (api/sso/token.ts provisions it), so
 * there is no invite and no delete: this app cannot create or remove a Ventera
 * identity. What it can do is decide what an existing user may see — their role
 * — and switch them off.
 *
 * The previous inviteStaffMember() and deactivateUser() called
 * supabase.auth.admin.*, which cannot work here twice over: Supabase Auth is
 * not the identity provider, and the admin API needs the service_role key,
 * which must never be shipped to a browser.
 */

export async function getProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name");
  if (error) throw error;
  return data;
}

export async function getStaffProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["admin", "staff"])
    .order("full_name");
  if (error) throw error;
  return data;
}

export async function getProfileById(id: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(
  id: string,
  payload: ProfileUpdate
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Only an admin may do this — enforced by the "Admin can update any profile"
 * policy, not by the caller. A non-admin's update matches no rows and throws.
 */
export async function updateUserRole(id: string, role: UserRole): Promise<Profile> {
  return updateProfile(id, { role });
}

/**
 * Revokes or restores access. get_my_role() ignores inactive users, so this
 * bites against RLS immediately, and the token exchange refuses to mint a new
 * token for them at their next sign-in.
 */
export async function setUserActive(id: string, isActive: boolean): Promise<Profile> {
  return updateProfile(id, { is_active: isActive });
}
