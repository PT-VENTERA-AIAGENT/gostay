import { supabase } from "@/lib/supabase";
import type { PosCategory, PaymentMethod } from "@/services/frontDeskService";

/**
 * Standalone POS / cashier (migration 020).
 *
 * `pos_products` and `pos_orders` are absent from the generated Database type,
 * so we reach for an untyped client — same approach as frontDeskService. Two
 * settlement paths exist:
 *   • walk-in  → createWalkInOrder() writes a pos_orders row (paid at the till)
 *   • to folio → reuses frontDeskService.addCharge() so the sale lands on a
 *                booking's balance; nothing is written here.
 *
 * tenant_id is stamped by a DB trigger on insert; never pass it.
 */

export interface PosProduct {
  id: string;
  tenant_id: string;
  name: string;
  category: PosCategory;
  price: number;
  is_active: boolean;
  created_at: string;
}

export interface PosOrderItem {
  description: string;
  category: PosCategory;
  unit_price: number;
  quantity: number;
}

export interface PosOrder {
  id: string;
  tenant_id: string;
  guest_name: string | null;
  items: PosOrderItem[];
  subtotal: number;
  payment_method: PaymentMethod;
  status: "paid" | "void";
  created_by: string | null;
  created_at: string;
}

/** A booking the cashier can post a folio charge onto. */
export interface FolioTarget {
  id: string;
  reference: string;
  guestName: string;
  roomNumber: string | null;
  status: string;
}

export interface CreateProductInput {
  name: string;
  category: PosCategory;
  price: number;
}

export interface CreateWalkInOrderInput {
  items: PosOrderItem[];
  subtotal: number;
  payment_method: PaymentMethod;
  guest_name?: string | null;
  created_by: string | null;
}

// The new tables are not in the generated Database type.
const db = supabase as unknown as { from: (table: string) => any };

// ─── Products ──────────────────────────────────────────────────────────────────

export async function listProducts(activeOnly = true): Promise<PosProduct[]> {
  let q = db.from("pos_products").select("*").order("category").order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PosProduct[];
}

export async function createProduct(input: CreateProductInput): Promise<PosProduct> {
  const { data, error } = await db
    .from("pos_products")
    .insert({ name: input.name, category: input.category, price: input.price })
    .select()
    .single();
  if (error) throw error;
  return data as PosProduct;
}

export async function setProductActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await db.from("pos_products").update({ is_active }).eq("id", id);
  if (error) throw error;
}

export interface UpdateProductInput {
  name?: string;
  category?: PosCategory;
  price?: number;
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<PosProduct> {
  const { data, error } = await db
    .from("pos_products")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as PosProduct;
}

// Line items on past orders are a jsonb snapshot (not a foreign key), so removing
// a product never orphans a sale — the history keeps the name/price it was sold at.
export async function deleteProduct(id: string): Promise<void> {
  const { error } = await db.from("pos_products").delete().eq("id", id);
  if (error) throw error;
}

// ─── Orders ────────────────────────────────────────────────────────────────────

export async function createWalkInOrder(input: CreateWalkInOrderInput): Promise<PosOrder> {
  const { data, error } = await db
    .from("pos_orders")
    .insert({
      guest_name: input.guest_name ?? null,
      items: input.items,
      subtotal: input.subtotal,
      payment_method: input.payment_method,
      status: "paid",
      created_by: input.created_by,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PosOrder;
}

export async function listRecentOrders(limit = 20): Promise<PosOrder[]> {
  const { data, error } = await db
    .from("pos_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PosOrder[];
}

/** Paid orders whose created_at falls in [startISO, endISO) — for the daily recap. */
export async function listOrdersBetween(startISO: string, endISO: string): Promise<PosOrder[]> {
  const { data, error } = await db
    .from("pos_orders")
    .select("*")
    .eq("status", "paid")
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PosOrder[];
}

// ─── Folio targets (in-house bookings to post a charge onto) ────────────────────

/**
 * Bookings a cashier can charge to. We surface anything still in the hotel —
 * pending / confirmed / checked_in — newest first, with the guest name and room
 * number resolved for the picker. checked_out and cancelled are excluded.
 */
export async function listFolioTargets(): Promise<FolioTarget[]> {
  const { data, error } = await db
    .from("bookings")
    .select("id, reference, status, customers(full_name), rooms(number)")
    .in("status", ["pending", "confirmed", "checked_in"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((b) => ({
    id: b.id,
    reference: b.reference,
    guestName: b.customers?.full_name ?? "Tamu",
    roomNumber: b.rooms?.number ?? null,
    status: b.status,
  }));
}
