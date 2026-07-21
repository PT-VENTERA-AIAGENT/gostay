import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listProducts,
  createProduct,
  setProductActive,
  updateProduct,
  deleteProduct,
  createWalkInOrder,
  listRecentOrders,
  listOrdersBetween,
  listFolioTargets,
} from "@/services/posService";
import type { CreateProductInput, UpdateProductInput, CreateWalkInOrderInput } from "@/services/posService";
import { addCharge } from "@/services/frontDeskService";
import type { AddChargeInput } from "@/services/frontDeskService";
import { frontDeskKeys } from "@/hooks/useFrontDesk";
import { bookingKeys } from "@/hooks/useBookings";

export const posKeys = {
  products: ["pos", "products"] as const,
  allProducts: ["pos", "products", "all"] as const,
  orders: ["pos", "orders"] as const,
  folioTargets: ["pos", "folio-targets"] as const,
  today: (day: string) => ["pos", "today", day] as const,
};

export function useProducts() {
  return useQuery({ queryKey: posKeys.products, queryFn: () => listProducts(true) });
}

/** Every product, active or not — for the "Kelola produk" management view. */
export function useAllProducts() {
  return useQuery({ queryKey: posKeys.allProducts, queryFn: () => listProducts(false) });
}

export function useRecentOrders() {
  return useQuery({ queryKey: posKeys.orders, queryFn: () => listRecentOrders(20) });
}

/**
 * Today's paid walk-in sales, bounded by the browser's local midnight so the
 * recap matches the cashier's day rather than UTC. Refreshed whenever a new sale
 * invalidates posKeys.orders isn't automatic here, so we also key by the day.
 */
export function useTodayOrders() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  const dayKey = `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`;
  return useQuery({
    queryKey: posKeys.today(dayKey),
    queryFn: () => listOrdersBetween(start.toISOString(), end.toISOString()),
  });
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

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      updateProduct(id, input),
    // posKeys.products is a prefix of posKeys.allProducts, so this refreshes both.
    onSuccess: () => qc.invalidateQueries({ queryKey: posKeys.products }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: posKeys.orders });
      qc.invalidateQueries({ queryKey: ["pos", "today"] });
    },
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
