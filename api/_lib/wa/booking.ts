// Service-role booking helpers for the WhatsApp flow (plan: whatsapp-ai-booking,
// Fase 5). Every query is tenant-scoped with an EXPLICIT tenant_id — these run
// under the service_role key, which bypasses RLS, so the tenant boundary the
// browser gets from get_my_tenant() has to be re-imposed by hand here.
//
// This is the server-side twin of src/services/roomService.getAvailableRooms and
// src/pages/portal/BookingReview.handleConfirm. It deliberately does NOT import
// @supabase/supabase-js or src/services/* — those are the browser (anon/RLS)
// path. It talks to PostgREST through the raw service-role fetch helpers in
// client.ts, same as provision.ts / inbound.ts.

import { serviceGet, serviceInsert } from "./client";

// ─── Shapes ──────────────────────────────────────────────────────────────────

/** The room_type columns this module selects. */
export interface RoomTypeLite {
  id: string;
  name: string;
  base_rate: number;
  max_occupancy: number;
}

/** The room columns this module selects. */
export interface RoomLite {
  id: string;
  room_type_id: string;
}

// ─── Room type lookup ──────────────────────────────────────────────────────────

/**
 * Finds a room type inside one tenant.
 *
 * With a `hint` (e.g. the AI's room_type_hint "deluxe"), matches the name
 * case-insensitively and returns the cheapest match — a sensible default when a
 * guest's fuzzy phrase maps to several types. With no hint, returns the tenant's
 * cheapest active room type. Null when the tenant has no matching active type.
 *
 * Only active types are considered: a WA guest must never be quoted a
 * de-listed room. tenant_id is passed explicitly because the service role sees
 * every tenant's types otherwise.
 */
export async function findRoomType(
  tenantId: string,
  hint: string | null,
): Promise<RoomTypeLite | null> {
  const trimmed = hint?.trim();
  let query =
    `room_types?tenant_id=eq.${encodeURIComponent(tenantId)}` +
    `&is_active=eq.true` +
    `&select=id,name,base_rate,max_occupancy` +
    `&order=base_rate.asc&limit=1`;

  if (trimmed) {
    // PostgREST ilike wildcard is `*`; wrap the hint so any substring matches.
    query += `&name=ilike.${encodeURIComponent(`*${trimmed}*`)}`;
  }

  const res = await serviceGet(query);
  if (!res.ok) throw new Error(`wa_room_type_lookup_failed_${res.status}`);
  const rows = (await res.json()) as RoomTypeLite[];
  return rows[0] ?? null;
}

/**
 * The hotel's display name, for branding the WA replies (greeting, confirmation).
 * Null when the tenant row can't be read — callers fall back to a generic phrase.
 */
export async function getTenantName(tenantId: string): Promise<string | null> {
  const res = await serviceGet(`tenants?id=eq.${encodeURIComponent(tenantId)}&select=name`);
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ name?: string }>;
  const name = rows[0]?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/** All active room types of a tenant, cheapest first — for the "pick a type" menu. */
export async function listRoomTypes(tenantId: string): Promise<RoomTypeLite[]> {
  const res = await serviceGet(
    `room_types?tenant_id=eq.${encodeURIComponent(tenantId)}&is_active=eq.true` +
      `&select=id,name,base_rate,max_occupancy&order=base_rate.asc`,
  );
  if (!res.ok) return [];
  return (await res.json()) as RoomTypeLite[];
}

// ─── Availability ──────────────────────────────────────────────────────────────

/**
 * The free rooms of one room type over [checkIn, checkOut), within one tenant.
 *
 * Ports src/services/roomService.getAvailableRooms (which runs the join in the
 * `available_rooms` SECURITY DEFINER RPC) to the service-role path: fetch the
 * type's active rooms, then subtract any room with an overlapping active
 * booking. "Active booking" mirrors the RPC exactly — status in
 * (confirmed, checked_in); cancelled/no-show/pending stays do not hold a room.
 *
 * Overlap is the half-open test the room board uses: a stay conflicts when it
 * starts before this checkout and ends after this checkin (check_out is
 * exclusive — the guest leaves that morning). An inverted or zero-night range
 * is answered with [] rather than "everything", same as the RPC's guard.
 */
export async function getAvailableRoomsSrv(
  tenantId: string,
  checkIn: string,
  checkOut: string,
  roomTypeId: string,
): Promise<RoomLite[]> {
  if (!(new Date(checkOut).getTime() > new Date(checkIn).getTime())) return [];

  const roomsRes = await serviceGet(
    `rooms?tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&room_type_id=eq.${encodeURIComponent(roomTypeId)}` +
      `&is_active=eq.true` +
      `&select=id,room_type_id&order=number.asc`,
  );
  if (!roomsRes.ok) throw new Error(`wa_rooms_lookup_failed_${roomsRes.status}`);
  const rooms = (await roomsRes.json()) as RoomLite[];
  if (rooms.length === 0) return [];

  const ids = rooms.map((r) => r.id);
  const conflictsRes = await serviceGet(
    `bookings?tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&room_id=in.(${ids.map(encodeURIComponent).join(",")})` +
      `&status=in.(confirmed,checked_in)` +
      `&check_in=lt.${encodeURIComponent(checkOut)}` +
      `&check_out=gt.${encodeURIComponent(checkIn)}` +
      `&select=room_id`,
  );
  if (!conflictsRes.ok) {
    throw new Error(`wa_conflicts_lookup_failed_${conflictsRes.status}`);
  }
  const conflicts = (await conflictsRes.json()) as Array<{ room_id: string }>;
  const busy = new Set(conflicts.map((c) => c.room_id));

  return rooms.filter((r) => !busy.has(r.id));
}

// ─── Pricing ───────────────────────────────────────────────────────────────────

/**
 * nights = whole days between check-in and check-out (checkout exclusive);
 * total = nights × base_rate. Same rule the portal's BookingReview uses. Both
 * dates are YYYY-MM-DD, parsed as UTC midnight so DST never shifts the count.
 */
export function computeTotal(
  baseRate: number,
  checkIn: string,
  checkOut: string,
): { nights: number; total: number } {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const start = new Date(checkIn + "T00:00:00Z").getTime();
  const end = new Date(checkOut + "T00:00:00Z").getTime();
  const nights = Math.max(0, Math.round((end - start) / MS_PER_DAY));
  return { nights, total: nights * baseRate };
}

// ─── Booking insert ────────────────────────────────────────────────────────────

/**
 * Creates the WhatsApp booking, service-role, tenant_id explicit.
 *
 * Mirrors BookingReview.handleConfirm's payload but from the server: always
 * status "pending" and payment_status "pending" with amount_paid 0 — a WA guest
 * can never create a confirmed (i.e. free) stay; only staff confirm in the
 * dashboard. `reference` is intentionally omitted: the set_booking_reference
 * BEFORE INSERT trigger (migration 001) fills it, and BookingInsert omits it
 * too. The inserted row is read back (return=representation) for its id and
 * generated reference.
 */
export async function createWaBooking(args: {
  tenantId: string;
  customerId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  total: number;
  createdBy: string;
}): Promise<{ id: string; reference: string | null }> {
  const res = await serviceInsert(
    "bookings",
    {
      tenant_id: args.tenantId,
      customer_id: args.customerId,
      room_id: args.roomId,
      check_in: args.checkIn,
      check_out: args.checkOut,
      num_adults: args.guests,
      num_children: 0,
      status: "pending",
      payment_status: "pending",
      amount_paid: 0,
      total_amount: args.total,
      source: "whatsapp",
      created_by: args.createdBy,
    },
    "return=representation",
  );

  if (!res.ok) throw new Error(`wa_booking_insert_failed_${res.status}`);
  const rows = (await res.json()) as Array<{ id: string; reference?: string | null }>;
  const row = rows[0];
  if (!row?.id) throw new Error("wa_booking_insert_no_row");
  return { id: row.id, reference: row.reference ?? null };
}
