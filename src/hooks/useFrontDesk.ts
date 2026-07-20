import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCharges,
  addCharge,
  deleteCharge,
  getPayments,
  addPayment,
  deletePayment,
} from "@/services/frontDeskService";
import type { AddChargeInput, AddPaymentInput } from "@/services/frontDeskService";
import { bookingKeys } from "@/hooks/useBookings";

export const frontDeskKeys = {
  charges: (bookingId: string) => ["frontDesk", "charges", bookingId] as const,
  payments: (bookingId: string) => ["frontDesk", "payments", bookingId] as const,
};

export function useCharges(bookingId: string) {
  return useQuery({
    queryKey: frontDeskKeys.charges(bookingId),
    queryFn: () => getCharges(bookingId),
    enabled: Boolean(bookingId),
  });
}

export function usePayments(bookingId: string) {
  return useQuery({
    queryKey: frontDeskKeys.payments(bookingId),
    queryFn: () => getPayments(bookingId),
    enabled: Boolean(bookingId),
  });
}

export function useAddCharge(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddChargeInput) => addCharge(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: frontDeskKeys.charges(bookingId) });
    },
  });
}

export function useDeleteCharge(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCharge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: frontDeskKeys.charges(bookingId) });
    },
  });
}

/**
 * Adding a payment fires a DB trigger that recomputes bookings.amount_paid and
 * payment_status, so the booking detail query is invalidated alongside the
 * payments list — that is what refreshes the status pill.
 */
export function useAddPayment(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddPaymentInput) => addPayment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: frontDeskKeys.payments(bookingId) });
      qc.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) });
      qc.invalidateQueries({ queryKey: bookingKeys.list() });
    },
  });
}

export function useDeletePayment(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: frontDeskKeys.payments(bookingId) });
      qc.invalidateQueries({ queryKey: bookingKeys.detail(bookingId) });
      qc.invalidateQueries({ queryKey: bookingKeys.list() });
    },
  });
}
