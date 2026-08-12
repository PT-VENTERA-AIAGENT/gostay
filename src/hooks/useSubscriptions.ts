import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSubscriptions, listHotelInvoices, issueInvoices, setInvoiceStatus,
  type InvoiceStatus,
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

export function useIssueInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      hotels: Array<{ tenant_id: string; subscription_amount: number }>;
      period: string;
      by: string;
    }) => issueInvoices(v.hotels, v.period, v.by),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriptionKeys.all }),
  });
}

export function useSetInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; status: InvoiceStatus; by: string; method?: string }) =>
      setInvoiceStatus(v.id, v.status, v.by, { method: v.method }),
    onSuccess: () => qc.invalidateQueries({ queryKey: subscriptionKeys.all }),
  });
}
