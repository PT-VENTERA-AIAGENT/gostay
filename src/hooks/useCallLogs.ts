import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCallLogs,
  getCallLogById,
  createCallLog,
  updateCallLog,
  deleteCallLog,
  lookupCallerByPhone,
  getPendingFollowUps,
} from "@/services/callLogService";
import type { CallLogFilters } from "@/services/callLogService";
import type { CallLogInsert, CallLogUpdate } from "@/types/database.types";

export const callLogKeys = {
  all: ["call-logs"] as const,
  list: (filters?: CallLogFilters) => ["call-logs", "list", filters] as const,
  detail: (id: string) => ["call-logs", "detail", id] as const,
  followUps: () => ["call-logs", "follow-ups"] as const,
  callerLookup: (phone: string) => ["call-logs", "lookup", phone] as const,
};

export function useCallLogs(filters?: CallLogFilters) {
  return useQuery({
    queryKey: callLogKeys.list(filters),
    queryFn: () => getCallLogs(filters),
  });
}

export function useCallLog(id: string) {
  return useQuery({
    queryKey: callLogKeys.detail(id),
    queryFn: () => getCallLogById(id),
    enabled: Boolean(id),
  });
}

export function usePendingFollowUps() {
  return useQuery({
    queryKey: callLogKeys.followUps(),
    queryFn: getPendingFollowUps,
    refetchInterval: 5 * 60_000,
  });
}

export function useCallerLookup(phone: string) {
  return useQuery({
    queryKey: callLogKeys.callerLookup(phone),
    queryFn: () => lookupCallerByPhone(phone),
    enabled: phone.replace(/\D/g, "").length >= 8,
  });
}

export function useCreateCallLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CallLogInsert) => createCallLog(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: callLogKeys.all }),
  });
}

export function useUpdateCallLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CallLogUpdate }) =>
      updateCallLog(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: callLogKeys.detail(id) });
      qc.invalidateQueries({ queryKey: callLogKeys.list() });
    },
  });
}

export function useDeleteCallLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCallLog(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: callLogKeys.all }),
  });
}
