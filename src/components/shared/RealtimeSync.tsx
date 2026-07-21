import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeToTable, unsubscribe } from "@/lib/realtime";

/**
 * One place that keeps the app live. Mounted inside the authenticated layouts,
 * it subscribes to each operational table and, on any change, invalidates the
 * React Query roots that depend on it — so lists, badges and detail pages
 * refresh across the app without a manual reload. RLS on the realtime socket
 * means a viewer only ever gets nudged by rows they can already see.
 *
 * `scope` trims the set: the guest portal only cares about a few tables.
 */
const STAFF_MAP: Record<string, readonly (readonly unknown[])[]> = {
  bookings: [["bookings"], ["analytics"]],
  guest_requests: [["guest-requests"], ["portal", "my-orders"]],
  reviews: [["reviews"]],
  pos_orders: [["pos"]],
  pos_charges: [["frontDesk"], ["bookings"]],
  payments: [["frontDesk"], ["bookings"]],
  rooms: [["rooms"]],
  call_logs: [["call-logs"]],
  customers: [["customers"], ["crm"]],
  chat_messages: [["chat"]],
  chat_threads: [["chat"]],
};

const GUEST_MAP: Record<string, readonly (readonly unknown[])[]> = {
  bookings: [["bookings"]],
  guest_requests: [["guest-requests"], ["portal", "my-orders"]],
  chat_messages: [["chat"]],
  chat_threads: [["chat"]],
};

export default function RealtimeSync({ scope = "staff" }: { scope?: "staff" | "guest" }) {
  const qc = useQueryClient();

  useEffect(() => {
    const map = scope === "guest" ? GUEST_MAP : STAFF_MAP;
    const channels = Object.entries(map).map(([table, keys]) =>
      subscribeToTable(table, () => {
        for (const key of keys) qc.invalidateQueries({ queryKey: key as unknown[] });
      }),
    );
    return () => channels.forEach(unsubscribe);
  }, [qc, scope]);

  return null;
}
