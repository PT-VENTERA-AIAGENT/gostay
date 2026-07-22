import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getFloorPlan, saveFloorPlan } from "@/services/floorPlanService";
import { useTenant } from "@/hooks/useTenant";
import type { SitePlan } from "@/types/floorPlan";

export const floorPlanKeys = {
  all: ["floor-plan"] as const,
  detail: () => ["floor-plan", "detail"] as const,
};

/** The current hotel's site plan (null until staff draw one). */
export function useFloorPlan() {
  return useQuery({
    queryKey: floorPlanKeys.detail(),
    queryFn: getFloorPlan,
  });
}

/** Persist the whole plan; needs the tenant id as the upsert conflict target. */
export function useSaveFloorPlan() {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  return useMutation({
    mutationFn: (plan: SitePlan) => {
      if (!tenant?.id) throw new Error("Tenant belum termuat.");
      return saveFloorPlan(tenant.id, plan);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: floorPlanKeys.detail() }),
  });
}
