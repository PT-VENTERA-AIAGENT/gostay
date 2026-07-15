import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProfiles, updateUserRole, setUserActive } from "@/services/userService";
import type { UserRole } from "@/types/database.types";

export const userKeys = {
  all: ["profiles"] as const,
  list: () => [...userKeys.all, "list"] as const,
};

export function useProfiles() {
  return useQuery({ queryKey: userKeys.list(), queryFn: getProfiles });
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
