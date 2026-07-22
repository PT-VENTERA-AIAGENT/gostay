import { supabase } from "@/lib/supabase";
import { coercePlan, type SitePlan } from "@/types/floorPlan";

// The site plan (denah) is one JSON row per hotel in floor_plans. RLS scopes
// every read/write to the caller's own tenant, and set_tenant_id() stamps the
// tenant on insert — so these calls never mention tenant_id except as the upsert
// conflict target, which the DB requires an explicit value for.

/** The hotel's plan, or null if staff have not drawn one yet. */
export async function getFloorPlan(): Promise<SitePlan | null> {
  const { data, error } = await supabase
    .from("floor_plans")
    .select("data")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return coercePlan((data as { data: unknown }).data);
}

/**
 * Save the whole plan. Upsert on tenant_id so the first save creates the row and
 * every later one overwrites it. tenant_id must be passed explicitly because it
 * is the conflict target — the RLS WITH CHECK still verifies it is the caller's.
 */
export async function saveFloorPlan(tenantId: string, plan: SitePlan): Promise<void> {
  const { error } = await supabase
    .from("floor_plans")
    .upsert(
      { tenant_id: tenantId, data: plan, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" },
    );
  if (error) throw error;
}
