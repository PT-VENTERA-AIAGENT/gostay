import { supabase } from "@/lib/supabase";
import type { Profile, ProfileUpdate, UserRole } from "@/types/database.types";

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

export async function inviteStaffMember(
  email: string,
  role: Extract<UserRole, "admin" | "staff">
): Promise<void> {
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role },
  });
  if (error) throw error;
}

export async function updateUserRole(
  id: string,
  role: UserRole
): Promise<Profile> {
  return updateProfile(id, { role });
}

export async function deactivateUser(id: string): Promise<void> {
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw error;
}
