import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listHotelPayments, setHotelMode, setHotelPaymentsActive, setHotelPayment, setHotelBilling,
  type BillingMode,
} from "@/services/adminPaymentService";
import { subscriptionKeys } from "./useSubscriptions";

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminPaymentKeys.list() });
      qc.invalidateQueries({ queryKey: ["platform"] }); // keep the platform console in sync
    },
  });
}

export function useSetHotelPaymentsActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tenantId: string; active: boolean; by: string }) =>
      setHotelPaymentsActive(v.tenantId, v.active, v.by),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminPaymentKeys.list() });
      qc.invalidateQueries({ queryKey: ["platform"] }); // keep the platform console in sync
    },
  });
}

export function useSetHotelPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tenantId: string; state: "off" | "test" | "live"; by: string }) =>
      setHotelPayment(v.tenantId, v.state, v.by),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminPaymentKeys.list() });
      qc.invalidateQueries({ queryKey: ["platform"] });
    },
  });
}

/** Pilih model tagihan hotel: potongan 7% atau langganan bulanan (offline). */
export function useSetHotelBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      tenantId: string;
      mode: BillingMode;
      amount?: number;
      day?: number;
      since?: string;
      keepMode?: "live" | "test";
      keepActive?: boolean;
      by: string;
    }) => setHotelBilling(
      v.tenantId,
      { mode: v.mode, amount: v.amount, day: v.day, since: v.since, keepMode: v.keepMode, keepActive: v.keepActive },
      v.by,
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminPaymentKeys.list() });
      qc.invalidateQueries({ queryKey: ["platform"] });
      // Pindah model mengubah siapa yang muncul di daftar langganan.
      qc.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}
