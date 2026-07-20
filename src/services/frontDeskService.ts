import { supabase } from "@/lib/supabase";

/**
 * Front-desk folio (POS charges) and payments.
 *
 * The `pos_charges` and `payments` tables were migrated after
 * database.types.ts was last generated, so they are not in the typed
 * Database schema. Every call below casts the table name to bypass the
 * PostgREST generics — the build tolerates it — and the row shapes are
 * described by the local interfaces here instead.
 *
 * tenant_id is stamped by a DB trigger on insert; never pass it. Likewise a
 * trigger on `payments` insert/delete recomputes bookings.amount_paid and
 * bookings.payment_status, so after a payment mutation the caller only needs to
 * refetch the booking — do not write those columns from the client.
 */

export type PosCategory = "fnb" | "minibar" | "laundry" | "spa" | "other";
export type PaymentMethod = "cash" | "transfer" | "card" | "qris" | "other";

export interface PosCharge {
  id: string;
  tenant_id: string;
  booking_id: string;
  description: string;
  category: PosCategory;
  unit_price: number;
  quantity: number;
  created_by: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  booking_id: string;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AddChargeInput {
  booking_id: string;
  description: string;
  category: PosCategory;
  unit_price: number;
  quantity: number;
  created_by: string | null;
}

export interface AddPaymentInput {
  booking_id: string;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  created_by: string | null;
}

// The new tables are absent from the generated Database type, so reach for an
// untyped client rather than fighting the `.from()` overloads on every call.
const db = supabase as unknown as {
  from: (table: string) => any;
};

// ─── POS charges (folio) ───────────────────────────────────────────────────────

export async function getCharges(bookingId: string): Promise<PosCharge[]> {
  const { data, error } = await db
    .from("pos_charges")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PosCharge[];
}

export async function addCharge(input: AddChargeInput): Promise<PosCharge> {
  const { data, error } = await db
    .from("pos_charges")
    .insert({
      booking_id: input.booking_id,
      description: input.description,
      category: input.category,
      unit_price: input.unit_price,
      quantity: input.quantity,
      created_by: input.created_by,
    })
    .select()
    .single();
  if (error) throw error;
  return data as PosCharge;
}

export async function deleteCharge(id: string): Promise<void> {
  const { error } = await db.from("pos_charges").delete().eq("id", id);
  if (error) throw error;
}

// ─── Payments ──────────────────────────────────────────────────────────────────

export async function getPayments(bookingId: string): Promise<Payment[]> {
  const { data, error } = await db
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Payment[];
}

export async function addPayment(input: AddPaymentInput): Promise<Payment> {
  const { data, error } = await db
    .from("payments")
    .insert({
      booking_id: input.booking_id,
      amount: input.amount,
      method: input.method,
      note: input.note ?? null,
      created_by: input.created_by,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Payment;
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await db.from("payments").delete().eq("id", id);
  if (error) throw error;
}
