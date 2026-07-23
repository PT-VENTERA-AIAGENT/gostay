import { useQuery } from "@tanstack/react-query";
import { listHotels, listAllReservations, listAllGuestRequests } from "@/services/platformService";

export const platformKeys = {
  all: ["platform"] as const,
  hotels: () => ["platform", "hotels"] as const,
  reservations: () => ["platform", "reservations"] as const,
  requests: () => ["platform", "requests"] as const,
};

export function usePlatformHotels() {
  return useQuery({ queryKey: platformKeys.hotels(), queryFn: listHotels });
}
export function usePlatformReservations() {
  return useQuery({ queryKey: platformKeys.reservations(), queryFn: () => listAllReservations(150) });
}
export function usePlatformGuestRequests() {
  return useQuery({ queryKey: platformKeys.requests(), queryFn: () => listAllGuestRequests(150) });
}

// Payment mode/active mutations are shared with the older admin hook.
export { useSetHotelMode, useSetHotelPaymentsActive } from "./useAdminPayments";
