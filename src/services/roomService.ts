import { supabase } from "@/lib/supabase";
import type {
  Room,
  RoomInsert,
  RoomUpdate,
  RoomType,
  RoomTypeInsert,
  RoomTypeUpdate,
  RoomWithType,
  SeasonalPricing,
  SeasonalPricingInsert,
  AvailabilityBlock,
  AvailabilityBlockInsert,
} from "@/types/database.types";

// ─── Room Types ───────────────────────────────────────────────────────────────

export async function getRoomTypes(): Promise<RoomType[]> {
  const { data, error } = await supabase
    .from("room_types")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function getRoomTypeBySlug(slug: string): Promise<RoomType> {
  const { data, error } = await supabase
    .from("room_types")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error) throw error;
  return data;
}

export async function createRoomType(payload: RoomTypeInsert): Promise<RoomType> {
  const { data, error } = await supabase
    .from("room_types")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoomType(
  id: string,
  payload: RoomTypeUpdate
): Promise<RoomType> {
  const { data, error } = await supabase
    .from("room_types")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRoomType(id: string): Promise<void> {
  const { error } = await supabase
    .from("room_types")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

// ─── Individual Rooms ─────────────────────────────────────────────────────────

export async function getRooms(): Promise<RoomWithType[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select(
      `
      *,
      room_types ( id, name, slug, base_rate ),
      current_booking:bookings (
        id, status, check_out, customer_id
      )
    `
    )
    .eq("is_active", true)
    .in("bookings.status", ["confirmed", "checked_in"])
    .order("number");
  if (error) throw error;
  return data as RoomWithType[];
}

export async function createRoom(payload: RoomInsert): Promise<Room> {
  const { data, error } = await supabase
    .from("rooms")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoom(id: string, payload: RoomUpdate): Promise<Room> {
  const { data, error } = await supabase
    .from("rooms")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

// ─── Seasonal Pricing ─────────────────────────────────────────────────────────

export async function getSeasonalPricing(
  roomTypeId: string
): Promise<SeasonalPricing[]> {
  const { data, error } = await supabase
    .from("seasonal_pricing")
    .select("*")
    .eq("room_type_id", roomTypeId)
    .order("start_date");
  if (error) throw error;
  return data;
}

export async function createSeasonalPricing(
  payload: SeasonalPricingInsert
): Promise<SeasonalPricing> {
  const { data, error } = await supabase
    .from("seasonal_pricing")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSeasonalPricing(id: string): Promise<void> {
  const { error } = await supabase
    .from("seasonal_pricing")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─── Availability Blocks ──────────────────────────────────────────────────────

export async function getAvailabilityBlocks(
  roomId: string
): Promise<AvailabilityBlock[]> {
  const { data, error } = await supabase
    .from("availability_blocks")
    .select("*")
    .eq("room_id", roomId)
    .gte("end_date", new Date().toISOString().split("T")[0])
    .order("start_date");
  if (error) throw error;
  return data;
}

export async function createAvailabilityBlock(
  payload: AvailabilityBlockInsert
): Promise<AvailabilityBlock> {
  const { data, error } = await supabase
    .from("availability_blocks")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAvailabilityBlock(id: string): Promise<void> {
  const { error } = await supabase
    .from("availability_blocks")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─── Availability Check ───────────────────────────────────────────────────────

export async function getAvailableRooms(
  checkIn: string,
  checkOut: string,
  roomTypeId?: string
): Promise<RoomWithType[]> {
  // The overlap join runs in Postgres (see 009_availability_rpc.sql), not here.
  // Subtracting conflicts client-side needed the caller to read `bookings`, and
  // RLS hands an anonymous visitor zero rows — so nothing was ever subtracted
  // and every room came back "available", occupied or not.
  const { data: freeRooms, error } = await supabase.rpc("available_rooms", {
    p_check_in: checkIn,
    p_check_out: checkOut,
    p_room_type_id: roomTypeId ?? null,
  });
  if (error) throw error;

  const ids = (freeRooms ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return [];

  // The RPC returns room columns only; re-read through PostgREST to attach the
  // room_types embed callers render.
  const { data, error: embedError } = await supabase
    .from("rooms")
    .select(`*, room_types ( id, name, slug, base_rate )`)
    .in("id", ids)
    .order("number");
  if (embedError) throw embedError;

  return (data ?? []) as RoomWithType[];
}
