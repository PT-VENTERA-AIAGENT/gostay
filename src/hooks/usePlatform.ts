import { useQuery } from "@tanstack/react-query";
import {
  listHotels, listAllReservations, listAllGuestRequests, listRoomAvailability,
  listAllThreads, listThreadMessages, listAllBalances, getPlatformCalendar,
} from "@/services/platformService";

export const platformKeys = {
  all: ["platform"] as const,
  hotels: () => ["platform", "hotels"] as const,
  reservations: () => ["platform", "reservations"] as const,
  requests: () => ["platform", "requests"] as const,
  rooms: (date: string) => ["platform", "rooms", date] as const,
  threads: () => ["platform", "threads"] as const,
  thread: (id: string) => ["platform", "thread", id] as const,
  balances: () => ["platform", "balances"] as const,
  calendar: (from: string, days: number) => ["platform", "calendar", from, days] as const,
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

export function usePlatformThreads() {
  return useQuery({ queryKey: platformKeys.threads(), queryFn: () => listAllThreads(200) });
}
export function usePlatformThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: platformKeys.thread(threadId ?? "none"),
    queryFn: () => listThreadMessages(threadId as string),
    enabled: Boolean(threadId),
  });
}
export function usePlatformBalances() {
  return useQuery({ queryKey: platformKeys.balances(), queryFn: listAllBalances });
}
export function usePlatformCalendar(from: string, days: number) {
  return useQuery({ queryKey: platformKeys.calendar(from, days), queryFn: () => getPlatformCalendar(from, days) });
}

// Payment mutations are shared with the older admin hook.
export { useSetHotelMode, useSetHotelPaymentsActive, useSetHotelPayment } from "./useAdminPayments";
