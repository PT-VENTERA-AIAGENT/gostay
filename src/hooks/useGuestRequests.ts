import { useQuery } from "@tanstack/react-query";
import { countOpenRequests } from "@/services/guestRequestService";

/**
 * Count of open guest requests, for the sidebar's "Permintaan Tamu" badge.
 * Keyed under ["guest-requests"], so RealtimeSync's invalidation on any
 * guest_requests change keeps it live.
 */
export function useOpenRequestsCount() {
  return useQuery({
    queryKey: ["guest-requests", "open-count"],
    queryFn: countOpenRequests,
  });
}
