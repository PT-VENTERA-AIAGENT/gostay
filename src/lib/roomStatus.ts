import type { RoomWithType } from "@/types/database.types";

export type RoomStatus = "available" | "occupied" | "checked_in" | "out_of_service" | "reserved";

/**
 * The live status of a room, derived from its bookings — `rooms` has no status
 * column of its own.
 *
 * roomService.getRooms() embeds `current_booking:bookings(...)` filtered to
 * confirmed/checked_in stays. That embed is one-to-many, so it arrives as an
 * array; taking [0] is what makes the status real. Reading `.status` straight
 * off the array (as this used to) always yielded undefined, so every active
 * room reported "available" no matter who was in it.
 */
export function deriveRoomStatus(room: RoomWithType): RoomStatus {
  if (!room.is_active) return "out_of_service";
  const booking = room.current_booking?.[0];
  if (!booking) return "available";
  if (booking.status === "checked_in") return "checked_in";
  if (booking.status === "confirmed") return "reserved";
  return "available";
}

export interface RoomStatusCounts {
  total: number;
  available: number;
  occupied: number;
  checked_in: number;
  reserved: number;
  out_of_service: number;
}

export function countRoomStatuses(rooms: RoomWithType[]): RoomStatusCounts {
  const counts: RoomStatusCounts = {
    total: rooms.length,
    available: 0,
    occupied: 0,
    checked_in: 0,
    reserved: 0,
    out_of_service: 0,
  };
  for (const r of rooms) counts[deriveRoomStatus(r)] += 1;
  return counts;
}
