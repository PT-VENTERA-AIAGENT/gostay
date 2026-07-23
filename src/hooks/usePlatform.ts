import { useQuery } from "@tanstack/react-query";
import { listHotels, listAllReservations, listAllGuestRequests, listRoomAvailability } from "@/services/platformService";

export const platformKeys = {
  all: ["platform"] as const,
  hotels: () => ["platform", "hotels"] as const,
  reservations: () => ["platform", "reservations"] as const,
  requests: () => ["platform", "requests"] as const,
  rooms: (date: string) => ["platform", "rooms", date] as const,
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
export function usePlatformRoomAvailability(date: string) {
  return useQuery({ queryKey: platformKeys.rooms(date), queryFn: () => listRoomAvailability(date) });
}

// Payment mutations are shared with the older admin hook.
export { useSetHotelMode, useSetHotelPaymentsActive, useSetHotelPayment } from "./useAdminPayments";
