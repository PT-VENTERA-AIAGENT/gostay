import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listProducts,
  createProduct,
  setProductActive,
  createWalkInOrder,
  listRecentOrders,
  listFolioTargets,
} from "@/services/posService";
import type { CreateProductInput, CreateWalkInOrderInput } from "@/services/posService";
import { addCharge } from "@/services/frontDeskService";
import type { AddChargeInput } from "@/services/frontDeskService";
import { frontDeskKeys } from "@/hooks/useFrontDesk";
import { bookingKeys } from "@/hooks/useBookings";

export const posKeys = {
  products: ["pos", "products"] as const,
  orders: ["pos", "orders"] as const,
  folioTargets: ["pos", "folio-targets"] as const,
};

export function useProducts() {
  return useQuery({ queryKey: posKeys.products, queryFn: () => listProducts(true) });
}

export function useRecentOrders() {
  return useQuery({ queryKey: posKeys.orders, queryFn: () => listRecentOrders(20) });
}

export function useFolioTargets() {
  return useQuery({ queryKey: posKeys.folioTargets, queryFn: () => listFolioTargets() });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: posKeys.products }),
  });
}

export function useSetProductActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      setProductActive(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: posKeys.products }),
  });
}

export function useCreateWalkInOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWalkInOrderInput) => createWalkInOrder(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: posKeys.orders }),
  });
}

/**
 * Post a cart to a booking's folio: one pos_charges row per line. The booking's
 * balance is recomputed off pos_charges in the Folio card, so we invalidate that
 * booking's charges plus the booking detail/list to refresh the totals.
 */
export function usePostToFolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      bookingId,
      lines,
    }: {
      bookingId: string;
      lines: Omit<AddChargeInput, "booking_id">[];
    }) => {
      for (const line of lines) {
        await addCharge({ ...line, booking_id: bookingId });
      }
    },
    onSuccess: (_data, { bookingId }) => {
      qc.invalidateQueries({ queryKey: frontDeskKeys.charges(bookingId) });
      qc.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) });
      qc.invalidateQueries({ queryKey: bookingKeys.list() });
    },
  });
}
