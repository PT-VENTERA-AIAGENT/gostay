import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getProfiles,
  getProfileById,
  updateProfile,
  updateUserRole,
  setUserActive,
} from "@/services/userService";
import type { ProfileUpdate, UserRole } from "@/types/database.types";
import { useAuth } from "@/contexts/AuthContext";

export const userKeys = {
  all: ["profiles"] as const,
  list: () => [...userKeys.all, "list"] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
};

export function useProfiles() {
  return useQuery({ queryKey: userKeys.list(), queryFn: getProfiles });
}

/** The signed-in user's own profile row. */
export function useMyProfile() {
  const { user } = useAuth();
  const id = user?.id ?? "";
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => getProfileById(id),
    enabled: Boolean(id),
  });
}

/**
 * Edits to the caller's own profile.
 *
 * Deliberately narrow: `phone` is the only field a user owns. role and
 * is_active are refused by the trigger in 005_tighten_rls.sql, and full_name and
 * email are overwritten from the SSO claims on every sign-in
 * (api/_lib/provision.ts) — accepting edits to those would look like it worked
 * and silently revert at the next login.
 */
export function useUpdateMyProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (payload: Pick<ProfileUpdate, "phone">) =>
      updateProfile(user!.id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => updateUserRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setUserActive(id, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}
