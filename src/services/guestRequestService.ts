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
    .select("*")
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
