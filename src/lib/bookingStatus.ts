import type { BookingStatus } from "@/types/database.types";

/**
 * The one place a booking status becomes words.
 *
 * Five screens defined this independently, all in hardcoded English, and they
 * had already drifted apart — one said "Checked-In", another "Checked In". The
 * hyphenated one matched no dictionary key at all, so even switching language
 * would have left it in English.
 *
 * Every one of these six keys was ALREADY translated. Nothing was missing; the
 * screens simply never asked. That is the shape of this whole class of bug: not
 * an absent translation, but a call site that went around it.
 *
 * Colours deliberately stay with each screen. A badge in a dense table wants
 * different weight from one on a detail page, and that is a real design
 * difference — unlike the words, which must never differ.
 */
export const BOOKING_STATUS_KEY: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  cancelled: "Cancelled",
  no_show: "No Show",
};

/** The status in the caller's language. Falls back to the raw value. */
export function statusLabel(status: BookingStatus | string, t: (s: string) => string): string {
  const key = BOOKING_STATUS_KEY[status as BookingStatus];
  return key ? t(key) : String(status);
}

/** Every status, in a stable order, for filter bars and legends. */
export const BOOKING_STATUSES: BookingStatus[] = [
  "pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show",
];
