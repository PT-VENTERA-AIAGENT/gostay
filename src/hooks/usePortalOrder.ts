import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listProducts } from "@/services/posService";
import {
  createRoomServiceOrder,
  listRequests,
  type RoomServiceOrderInput,
} from "@/services/guestRequestService";

export const portalOrderKeys = {
  menu: ["portal", "menu"] as const,
  myOrders: ["portal", "my-orders"] as const,
};

/** The hotel's active POS menu — readable by in-house guests since migration 021. */
export function usePortalMenu() {
  return useQuery({
    queryKey: portalOrderKeys.menu,
    queryFn: () => listProducts(true),
  });
}

/** The guest's own requests/orders (RLS returns only theirs), newest first. */
export function useMyRoomServiceOrders(enabled = true) {
  return useQuery({
    queryKey: portalOrderKeys.myOrders,
    queryFn: () => listRequests(),
    enabled,
  });
}

export function usePlaceRoomServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RoomServiceOrderInput) => createRoomServiceOrder(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: portalOrderKeys.myOrders }),
  });
}
