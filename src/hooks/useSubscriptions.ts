import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSubscriptions, listHotelInvoices, issueInvoices,
  recordManualPayment, undoManualPayments, setInvoiceWaived,
  createManualInvoice, deleteInvoice,
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

/** Bebaskan / cabut pembebasan satu tagihan. */
export function useSetInvoiceWaived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; waived: boolean; by: string; reason?: string }) =>
      setInvoiceWaived(v.id, v.waived, v.by, v.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriptionKeys.all }),
  });
}

/** Terbitkan satu tagihan di luar jadwal. */
export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tenantId: string; period: string; amount: number; by: string; note?: string }) =>
      createManualInvoice(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriptionKeys.all }),
  });
}

/** Hapus tagihan yang salah terbit (ditolak kalau sudah ada pembayarannya). */
export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number }) => deleteInvoice(v.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriptionKeys.all }),
  });
}
