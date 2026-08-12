import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSubscriptions, listHotelInvoices, issueInvoices,
  recordManualPayment, undoManualPayments, setInvoiceWaived,
  type SubscriptionInvoice,
} from "@/services/subscriptionService";

export const subscriptionKeys = {
  all: ["subscriptions"] as const,
  list: () => ["subscriptions", "list"] as const,
  hotel: (id: string) => ["subscriptions", "hotel", id] as const,
};

/** Semua hotel berlangganan + riwayat tagihannya (konsol platform). */
export function useSubscriptions() {
  return useQuery({ queryKey: subscriptionKeys.list(), queryFn: () => listSubscriptions(12) });
}

export function useHotelInvoices(tenantId: string | undefined) {
  return useQuery({
    queryKey: subscriptionKeys.hotel(tenantId ?? "none"),
    queryFn: () => listHotelInvoices(tenantId as string, 12),
    enabled: Boolean(tenantId),
  });
}

/** Terbitkan semua tagihan yang belum ada — satu hotel, atau semuanya. */
export function useIssueInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tenantId?: string }) => issueInvoices(v.tenantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriptionKeys.all }),
  });
}

/** Catat transfer yang sudah diterima Ventera. */
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { invoice: SubscriptionInvoice; by: string; method?: "transfer" | "cash" }) =>
      recordManualPayment(v.invoice, v.by, { method: v.method }),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriptionKeys.all }),
  });
}

/** Batalkan pencatatan transfer (hanya yang dicatat tangan). */
export function useUndoPayments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { invoiceId: number }) => undoManualPayments(v.invoiceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriptionKeys.all }),
  });
}

export function useSetInvoiceWaived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; waived: boolean; by: string }) =>
      setInvoiceWaived(v.id, v.waived, v.by),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriptionKeys.all }),
  });
}
