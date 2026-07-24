import { platformDb } from "@/lib/supabase";

// Ventera super-admin control over each hotel's payment environment. Reads every
// tenant and writes hotel_payment_config, so it runs on the platform-console
// client: since 035 those policies need `platform_admin_scope()` — the operator
// allowlist AND the `x-platform-scope` header only `platformDb` sends. A hotel's
// own staff still read their own row through the plain client.
// Untyped cast: these tables aren't in the generated types.
const db = platformDb as unknown as { from: (table: string) => any };

export interface HotelPaymentRow {
  tenant_id: string;
  name: string;
  slug: string;
  is_active: boolean;          // the hotel/tenant itself
  mode: "live" | "test";       // effective payment mode (default 'test')
  payments_active: boolean;    // online payments on/off for this hotel
  updated_at: string | null;
}

/** Every hotel with its payment config (missing config → defaults test/on). */
export async function listHotelPayments(): Promise<HotelPaymentRow[]> {
  const { data, error } = await db
    .from("tenants")
    .select("id,name,slug,is_active,hotel_payment_config(mode,is_active,updated_at)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((t: any) => {
    const cfg = Array.isArray(t.hotel_payment_config) ? t.hotel_payment_config[0] : t.hotel_payment_config;
    return {
      tenant_id: t.id,
      name: t.name,
      slug: t.slug,
      is_active: t.is_active,
      mode: cfg?.mode === "live" ? "live" : "test",
      payments_active: cfg?.is_active ?? true,
      updated_at: cfg?.updated_at ?? null,
    } as HotelPaymentRow;
  });
}

/** Flip one hotel between live and test. Upsert touches only `mode`. */
export async function setHotelMode(tenantId: string, mode: "live" | "test", by: string): Promise<void> {
  const { error } = await db
    .from("hotel_payment_config")
    .upsert({ tenant_id: tenantId, mode, updated_by: by }, { onConflict: "tenant_id" });
  if (error) throw error;
}

/** Enable/disable online payments for one hotel. Upsert touches only `is_active`. */
export async function setHotelPaymentsActive(tenantId: string, active: boolean, by: string): Promise<void> {
  const { error } = await db
    .from("hotel_payment_config")
    .upsert({ tenant_id: tenantId, is_active: active, updated_by: by }, { onConflict: "tenant_id" });
  if (error) throw error;
}

/**
 * Set a hotel's payment state in one shot — the single [Off | Test | Live]
 * control. "off" disables online payments; "test"/"live" enable them in that
 * environment. One upsert so active + mode never disagree.
 */
export async function setHotelPayment(
  tenantId: string, state: "off" | "test" | "live", by: string,
): Promise<void> {
  const patch: Record<string, unknown> = { tenant_id: tenantId, updated_by: by };
  if (state === "off") patch.is_active = false;
  else { patch.is_active = true; patch.mode = state; }
  const { error } = await db.from("hotel_payment_config").upsert(patch, { onConflict: "tenant_id" });
  if (error) throw error;
}
