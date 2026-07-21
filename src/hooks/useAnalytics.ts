import { useQuery } from "@tanstack/react-query";
import { getAnalytics } from "@/services/analyticsService";

export const analyticsKeys = {
  all: ["analytics"] as const,
  range: (days: number) => [...analyticsKeys.all, days] as const,
};

export function useAnalytics(rangeDays: number) {
  return useQuery({
    queryKey: analyticsKeys.range(rangeDays),
    queryFn: () => getAnalytics(rangeDays),
    // Everything is derived from one booking fetch, so a short cache keeps the
    // page snappy when switching ranges without going stale on the floor.
    staleTime: 60_000,
  });
}
