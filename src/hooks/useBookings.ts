import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBookings,
  getBookingById,
  createBooking,
  createWalkInCheckIn,
  updateBookingStatus,
  updateBooking,
  getAuditLog,
  getTodayArrivals,
  getTodayDepartures,
  searchCustomers,
  getCustomerBookings,
  getMyBookings,
  getBookingsInRange,
  countPendingBookings,
} from "@/services/bookingService";
import { addPayment } from "@/services/frontDeskService";
import type { PaymentMethod } from "@/services/frontDeskService";
import type {
  BookingFilters,
  BookingInsert,
  BookingUpdate,
  BookingStatus,
} from "@/services/bookingService";
import type { WalkInInput } from "@/services/bookingService";
import type { BookingUpdate as BookingUpdateType } from "@/types/database.types";
import { useAuth } from "@/contexts/AuthContext";

export const bookingKeys = {
  all: ["bookings"] as const,
  list: (filters?: BookingFilters) => ["bookings", "list", filters] as const,
  detail: (id: string) => ["bookings", "detail", id] as const,
  audit: (id: string) => ["bookings", "audit", id] as const,
  arrivals: () => ["bookings", "arrivals"] as const,
  departures: () => ["bookings", "departures"] as const,
  customerBookings: (customerId: string) =>
    ["bookings", "customer", customerId] as const,
  mine: (profileId: string) => ["bookings", "mine", profileId] as const,
  range: (start: string, end: string) => ["bookings", "range", start, end] as const,
  pendingCount: () => ["bookings", "pending-count"] as const,
};

/** Count of pending bookings, for the sidebar's Reservations badge. */
export function usePendingBookingsCount() {
  return useQuery({
    queryKey: bookingKeys.pendingCount(),
    queryFn: countPendingBookings,
    refetchInterval: 60_000,
  });
}

export function useBookings(filters?: BookingFilters) {
  return useQuery({
    queryKey: bookingKeys.list(filters),
    queryFn: () => getBookings(filters),
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: bookingKeys.detail(id),
    queryFn: () => getBookingById(id),
    enabled: Boolean(id),
  });
}

export function useBookingAuditLog(bookingId: string) {
  return useQuery({
    queryKey: bookingKeys.audit(bookingId),
    queryFn: () => getAuditLog(bookingId),
    enabled: Boolean(bookingId),
  });
}

export function useTodayArrivals() {
  return useQuery({
    queryKey: bookingKeys.arrivals(),
    queryFn: getTodayArrivals,
    refetchInterval: 60_000,
  });
}

export function useTodayDepartures() {
  return useQuery({
    queryKey: bookingKeys.departures(),
    queryFn: getTodayDepartures,
    refetchInterval: 60_000,
  });
}

export function useCustomerBookings(customerId: string) {
  return useQuery({
    queryKey: bookingKeys.customerBookings(customerId),
    queryFn: () => getCustomerBookings(customerId),
    enabled: Boolean(customerId),
  });
}

/** Bookings overlapping a date window, for the calendar. */
export function useBookingsInRange(rangeStart: string, rangeEnd: string) {
  return useQuery({
    queryKey: bookingKeys.range(rangeStart, rangeEnd),
    queryFn: () => getBookingsInRange(rangeStart, rangeEnd),
    enabled: Boolean(rangeStart && rangeEnd),
  });
}

/**
 * The signed-in user's own bookings. Takes no id: passing one would invite a
 * caller to pass someone else's, and the answer comes from auth.uid() anyway.
 */
export function useMyBookings() {
  const { user } = useAuth();
  const profileId = user?.id ?? "";
  return useQuery({
    queryKey: bookingKeys.mine(profileId),
    queryFn: () => getMyBookings(profileId),
    enabled: Boolean(profileId),
  });
}

export function useSearchCustomers(query: string) {
  return useQuery({
    queryKey: ["customers", "search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.length >= 2,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BookingInsert) => createBooking(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingKeys.all }),
  });
}

/**
 * Walk-in check-in: create the guest + a checked_in booking, then optionally
 * record a first payment (its trigger recomputes the balance). Invalidates the
 * whole booking tree so the list, arrivals and calendar all refresh.
 */
export function useWalkInCheckIn() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      input,
      payment,
    }: {
      input: Omit<WalkInInput, "createdBy">;
      payment?: { amount: number; method: PaymentMethod } | null;
    }) => {
      const { booking, customer } = await createWalkInCheckIn({
        ...input,
        createdBy: user?.id ?? null,
      });
      if (payment && payment.amount > 0) {
        await addPayment({
          booking_id: booking.id,
          amount: payment.amount,
          method: payment.method,
          note: "Pembayaran walk-in",
          created_by: user?.id ?? null,
        });
      }
      return { booking, customer };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: bookingKeys.all }),
  });
}

export function useUpdateBookingStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: BookingStatus;
      note?: string;
    }) => updateBookingStatus(id, status, user?.id ?? "system", note),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: bookingKeys.detail(id) });
      qc.invalidateQueries({ queryKey: bookingKeys.list() });
      qc.invalidateQueries({ queryKey: bookingKeys.arrivals() });
      qc.invalidateQueries({ queryKey: bookingKeys.departures() });
      // Confirming/cancelling a pending booking changes the sidebar badge.
      qc.invalidateQueries({ queryKey: bookingKeys.pendingCount() });
    },
  });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: BookingUpdateType;
    }) => updateBooking(id, payload, user?.id ?? "system"),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: bookingKeys.detail(id) });
      qc.invalidateQueries({ queryKey: bookingKeys.list() });
    },
  });
}
