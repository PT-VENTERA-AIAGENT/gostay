// @vitest-environment node
import { describe, it, expect } from "vitest";
import { deriveRoomStatus, countRoomStatuses } from "./roomStatus";
import type { RoomWithType } from "@/types/database.types";

function room(over: Partial<RoomWithType> = {}): RoomWithType {
  return {
    id: "room-101",
    room_type_id: "rt-1",
    number: "101",
    floor: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    room_types: { id: "rt-1", name: "Standard", slug: "standard", base_rate: 500_000 },
    current_booking: [],
    ...over,
  } as RoomWithType;
}

const booking = (status: string) =>
  [{ id: "bk-1", status, check_out: "2026-07-20", customer_id: "cust-1" }] as RoomWithType["current_booking"];

describe("deriveRoomStatus", () => {
  it("reads the embed as an array — an occupied room is not 'available'", () => {
    // The regression this guards: current_booking arrives from PostgREST as a
    // list, so reading .status off the array itself gave undefined and every
    // room fell through to "available".
    expect(deriveRoomStatus(room({ current_booking: booking("checked_in") }))).toBe("checked_in");
  });

  it("marks a confirmed stay as reserved", () => {
    expect(deriveRoomStatus(room({ current_booking: booking("confirmed") }))).toBe("reserved");
  });

  it("treats an empty embed as available", () => {
    // [] is truthy, which is exactly what the old null-check missed.
    expect(deriveRoomStatus(room({ current_booking: [] }))).toBe("available");
  });

  it("treats a missing embed as available", () => {
    expect(deriveRoomStatus(room({ current_booking: null }))).toBe("available");
    expect(deriveRoomStatus(room({ current_booking: undefined }))).toBe("available");
  });

  it("puts an inactive room out of service regardless of bookings", () => {
    expect(deriveRoomStatus(room({ is_active: false, current_booking: booking("checked_in") })))
      .toBe("out_of_service");
  });

  it("ignores a status that does not hold the room", () => {
    expect(deriveRoomStatus(room({ current_booking: booking("checked_out") }))).toBe("available");
  });
});

describe("countRoomStatuses", () => {
  it("counts each status once and totals them", () => {
    const counts = countRoomStatuses([
      room({ id: "a", current_booking: booking("checked_in") }),
      room({ id: "b", current_booking: booking("checked_in") }),
      room({ id: "c", current_booking: booking("confirmed") }),
      room({ id: "d", current_booking: [] }),
      room({ id: "e", is_active: false }),
    ]);

    expect(counts).toEqual({
      total: 5,
      available: 1,
      occupied: 0,
      checked_in: 2,
      reserved: 1,
      out_of_service: 1,
    });
    const summed = counts.available + counts.occupied + counts.checked_in + counts.reserved + counts.out_of_service;
    expect(summed).toBe(counts.total);
  });

  it("handles no rooms", () => {
    expect(countRoomStatuses([]).total).toBe(0);
  });
});
