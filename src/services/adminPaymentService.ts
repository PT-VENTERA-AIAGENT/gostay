import { platformDb } from "@/lib/supabase";

// Ventera super-admin control over each hotel's payment environment. Reads every
// tenant and writes hotel_payment_config, so it runs on the platform-console
// client: since 035 those policies need `platform_admin_scope()` — the operator
// allowlist AND the `x-platform-scope` header only `platformDb` sends. A hotel's
// own staff still read their own row through the plain client.
// Untyped cast: these tables aren't in the generated types.
const db = platformDb as unknown as { from: (table: string) => any };

/**
 * How Ventera charges this hotel (migration 055) — orthogonal to live/test:
 * a subscription hotel can still take live Xendit payments, Ventera just
 * doesn't cut them.
 */
export type BillingMode = "commission" | "subscription";

export interface HotelBillingSettings {
  billing_mode: BillingMode;
  /** Monthly fee in rupiah. Only meaningful on 'subscription'. */
  subscription_amount: number;
  /** Day of month the monthly fee falls due (1–28). */
  subscription_day: number;
  subscription_since: string | null;
}

export interface HotelPaymentRow {
  tenant_id: string;
  name: string;
  slug: string;
  is_active: boolean;          // the hotel/tenant itself
  mode: "live" | "test";       // effective payment mode (default 'test')
  payments_active: boolean;    // online payments on/off for this hotel
  updated_at: string | null;
}

/** Read one hotel's config row into billing settings, defaults included. */
export function billingOf(cfg: any | null | undefined): HotelBillingSettings {
  return {
    billing_mode: cfg?.billing_mode === "subscription" ? "subscription" : "commission",
    subscription_amount: Number(cfg?.subscription_amount ?? 0),
    subscription_day: Number(cfg?.subscription_day ?? 1),
    subscription_since: cfg?.subscription_since ?? null,
  };
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

/**
 * Choose how Ventera charges this hotel: a 7% cut per payment, or a flat
 * monthly fee the hotel transfers offline.
 *
 * Writing this column is platform-only (RLS, 032/035) — a hotel that could set
 * it would be able to zero its own fee. Switching to commission deliberately
 * leaves `subscription_amount`/`subscription_day` alone: they're the hotel's
 * agreed terms, and keeping them means switching back doesn't lose them.
 *
 * `since` is passed by the caller rather than stamped here, so that editing the
 * fee of a hotel that already subscribes doesn't silently move its start date.
 */
export async function setHotelBilling(
  tenantId: string,
  input: { mode: BillingMode; amount?: number; day?: number; since?: string },
  by: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    tenant_id: tenantId,
    billing_mode: input.mode,
    updated_by: by,
  };
  if (input.amount !== undefined) patch.subscription_amount = Math.max(0, Math.round(input.amount));
  if (input.day !== undefined) patch.subscription_day = Math.min(28, Math.max(1, Math.round(input.day)));
  if (input.since !== undefined) patch.subscription_since = input.since;
  const { error } = await db.from("hotel_payment_config").upsert(patch, { onConflict: "tenant_id" });
  if (error) throw error;
}
