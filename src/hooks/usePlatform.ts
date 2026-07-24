import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  listHotels, listAllReservations, listAllGuestRequests, listRoomAvailability,
  listAllThreads, listThreadMessages, listAllBalances, getPlatformCalendar,
  getHotelDetail, getPlatformRoomBoard, getPlatformRoomCalendar,
} from "@/services/platformService";

/**
 * Is the signed-in user a Ventera platform operator?
 *
 * Authority since 035 is the `platform_admins` allowlist, not `profiles.role`.
 * The RPC is_platform_admin() answers it (SECURITY DEFINER — the table itself is
 * sealed). Used to show the "Konsol Platform" switch and gate the console UI, so
 * a role that is 'admin' but not on the allowlist won't see an empty console.
 * Fails closed: any error → not an operator.
 */
export function useIsPlatformAdmin() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["is-platform-admin", session?.profile_id ?? "anon"],
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error) return false;
      return data === true;
    },
  });
}

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
  roomBoard: (date: string) => ["platform", "room-board", date] as const,
  roomCalendar: (from: string, days: number) => ["platform", "room-calendar", from, days] as const,
  hotel: (id: string) => ["platform", "hotel", id] as const,
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
export function usePlatformRoomBoard(date: string) {
  return useQuery({ queryKey: platformKeys.roomBoard(date), queryFn: () => getPlatformRoomBoard(date) });
}
export function usePlatformRoomCalendar(from: string, days: number) {
  return useQuery({ queryKey: platformKeys.roomCalendar(from, days), queryFn: () => getPlatformRoomCalendar(from, days) });
}
export function usePlatformHotelDetail(tenantId: string | undefined) {
  return useQuery({
    queryKey: platformKeys.hotel(tenantId ?? "none"),
    queryFn: () => getHotelDetail(tenantId as string),
    enabled: Boolean(tenantId),
  });
}

// Payment mutations are shared with the older admin hook.
export { useSetHotelMode, useSetHotelPaymentsActive, useSetHotelPayment } from "./useAdminPayments";
