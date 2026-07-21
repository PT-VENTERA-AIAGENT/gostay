import { supabase } from "@/lib/supabase";

/**
 * `guest_requests` is not yet in database.types.ts, so every call here is cast
 * through `any`. tenant_id is stamped by a database trigger — never send it.
 */

export type GuestRequestStatus = "open" | "in_progress" | "done" | "cancelled";
export type GuestRequestPriority = "low" | "normal" | "high";

export interface GuestRequest {
  id: string;
  tenant_id: string;
  booking_id: string | null;
  room_id: string | null;
  customer_id: string | null;
  title: string;
  description: string | null;
  status: GuestRequestStatus;
  priority: GuestRequestPriority;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined for the staff queue so the front desk knows who + which room.
  customers?: { full_name: string | null } | null;
  rooms?: { number: string | null } | null;
}

export interface GuestRequestFilters {
  status?: GuestRequestStatus;
}

export interface CreateGuestRequestInput {
  title: string;
  description?: string | null;
  priority: GuestRequestPriority;
  room_id?: string | null;
  booking_id?: string | null;
  created_by: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function listRequests(
  filter: GuestRequestFilters = {}
): Promise<GuestRequest[]> {
  let query = db
    .from("guest_requests")
    .select("*, customers ( full_name ), rooms ( number )")
    .order("created_at", { ascending: false });

  if (filter.status) query = query.eq("status", filter.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GuestRequest[];
}

export async function createRequest(
  input: CreateGuestRequestInput
): Promise<GuestRequest> {
  // tenant_id is intentionally omitted — the trigger stamps it.
  const payload = {
    title: input.title,
    description: input.description ?? null,
    priority: input.priority,
    room_id: input.room_id ?? null,
    booking_id: input.booking_id ?? null,
    created_by: input.created_by,
  };

  const { data, error } = await db
    .from("guest_requests")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as GuestRequest;
}

export interface RoomServiceItem {
  name: string;
  category?: string | null;
  unit_price: number;
  quantity: number;
}

export interface RoomServiceOrderInput {
  customer_id: string;
  booking_id: string;
  room_id?: string | null;
  items: RoomServiceItem[];
  note?: string;
  created_by: string; // the guest's own profile id
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

/**
 * A guest ordering from the room-service menu. Unlike the staff createRequest,
 * this MUST carry customer_id — the RLS insert policy (021) pins the row to the
 * caller's own in-house booking. The picked items and total are rendered into
 * the request's description so staff read the full order in the existing
 * "Permintaan Tamu" queue, then post it to the folio via POS.
 */
export async function createRoomServiceOrder(
  input: RoomServiceOrderInput
): Promise<GuestRequest> {
  const total = input.items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const count = input.items.reduce((s, it) => s + it.quantity, 0);
  const lines = input.items.map(
    (it) => `${it.quantity}× ${it.name} — ${idr(it.unit_price * it.quantity)}`
  );
  const description =
    [...lines, `Total: ${idr(total)}`, input.note?.trim() ? `Catatan: ${input.note.trim()}` : null]
      .filter(Boolean)
      .join("\n");

  // tenant_id is stamped by the trigger; customer_id is required by RLS.
  const payload = {
    title: `Room service — ${count} item`,
    description,
    priority: "normal",
    room_id: input.room_id ?? null,
    booking_id: input.booking_id,
    customer_id: input.customer_id,
    created_by: input.created_by,
  };

  const { data, error } = await db
    .from("guest_requests")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as GuestRequest;
}

export async function updateRequestStatus(
  id: string,
  status: GuestRequestStatus
): Promise<GuestRequest> {
  const { data, error } = await db
    .from("guest_requests")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as GuestRequest;
}

/**
 * Resolve a free-text room number to a room_id. Returns null when it does not
 * match a room, so the caller can just leave room_id unset.
 */
export async function resolveRoomIdByNumber(
  roomNumber: string
): Promise<string | null> {
  const trimmed = roomNumber.trim();
  if (!trimmed) return null;
  const { data } = await db
    .from("rooms")
    .select("id")
    .eq("number", trimmed)
    .maybeSingle();
  return data?.id ?? null;
}
