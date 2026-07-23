import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listHotelPayments, setHotelMode, setHotelPaymentsActive,
} from "@/services/adminPaymentService";

export const adminPaymentKeys = {
  all: ["admin-payments"] as const,
  list: () => ["admin-payments", "list"] as const,
};

export function useHotelPayments() {
  return useQuery({ queryKey: adminPaymentKeys.list(), queryFn: listHotelPayments });
}

export function useSetHotelMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tenantId: string; mode: "live" | "test"; by: string }) =>
      setHotelMode(v.tenantId, v.mode, v.by),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminPaymentKeys.list() }),
  });
}

export function useSetHotelPaymentsActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tenantId: string; active: boolean; by: string }) =>
      setHotelPaymentsActive(v.tenantId, v.active, v.by),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminPaymentKeys.list() }),
  });
}
