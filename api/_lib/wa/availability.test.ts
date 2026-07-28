// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const { client, booking } = vi.hoisted(() => ({
  client: { serviceGet: vi.fn() },
  booking: { listRoomTypes: vi.fn(), getAvailableRoomsSrv: vi.fn() },
}));
vi.mock("./client", () => client);
vi.mock("./booking", () => booking);

import { checkAvailability, renderAvailability, matchRoomType, todayJakarta } from "./availability";
import { detectAvailabilityQuery } from "./ai";

const TYPES = [
  { id: "rt-1", name: "Reguler", base_rate: 120000, max_occupancy: 2 },
  { id: "rt-2", name: "Deluxe", base_rate: 185000, max_occupancy: 2 },
];

/** rooms?…select=room_type_id — the totals read. */
function rooms(rows: Array<{ room_type_id: string }>) {
  client.serviceGet.mockResolvedValue({ ok: true, json: async () => rows } as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  booking.listRoomTypes.mockResolvedValue(TYPES);
  booking.getAvailableRoomsSrv.mockResolvedValue([]);
  rooms([
    { room_type_id: "rt-1" }, { room_type_id: "rt-1" }, { room_type_id: "rt-1" },
    { room_type_id: "rt-2" }, { room_type_id: "rt-2" },
  ]);
});

describe("detectAvailabilityQuery", () => {
  it("recognises the question the screenshot showed being answered with a form", () => {
    expect(detectAvailabilityQuery("Ada kamar yang kosong di reguler ?")).toBe(true);
  });

  it("recognises the usual phrasings", () => {
    for (const q of [
      "ada kamar kosong?", "kamar deluxe masih ada?", "masih ada kamar?",
      "kamar tersedia ga", "sisa kamar berapa", "room available?",
    ]) {
      expect(detectAvailabilityQuery(q), q).toBe(true);
    }
  });

  it("does not fire on a booking request that merely mentions a room", () => {
    // Both parts must be present. These have a room word but no availability
    // cue, so they stay with the booking flow where they belong.
    for (const q of [
      "kamar deluxe untuk 2 orang", "mau pesan kamar", "a/n Budi, 25-27 Juli, 2 orang, Deluxe",
    ]) {
      expect(detectAvailabilityQuery(q), q).toBe(false);
    }
  });

  it("does not fire on an availability cue with no room word", () => {
    expect(detectAvailabilityQuery("masih ada?")).toBe(false);
    expect(detectAvailabilityQuery("parkirnya kosong?")).toBe(false);
  });

  it("handles empty input", () => {
    expect(detectAvailabilityQuery("")).toBe(false);
    expect(detectAvailabilityQuery("   ")).toBe(false);
  });
});

describe("matchRoomType", () => {
  it("matches a type named anywhere in the sentence", () => {
    expect(matchRoomType(TYPES, "ada kamar yang kosong di reguler ?")?.id).toBe("rt-1");
    expect(matchRoomType(TYPES, "deluxe masih ada?")?.id).toBe("rt-2");
  });

  it("returns null when no type is named", () => {
    expect(matchRoomType(TYPES, "ada kamar kosong?")).toBeNull();
    expect(matchRoomType(TYPES, "")).toBeNull();
  });
});

describe("checkAvailability", () => {
  it("defaults to tonight when the guest gives no dates", async () => {
    const a = await checkAvailability({ tenantId: "t" });
    expect(a.checkIn).toBe(todayJakarta());
    expect(a.nights).toBe(1);
  });

  it("narrows to the type the guest named", async () => {
    const a = await checkAvailability({ tenantId: "t", typeHint: "ada yang kosong di reguler?" });
    expect(a.narrowed).toBe(true);
    expect(a.types.map((t) => t.name)).toEqual(["Reguler"]);
  });

  it("reports every type when none is named", async () => {
    const a = await checkAvailability({ tenantId: "t" });
    expect(a.narrowed).toBe(false);
    expect(a.types).toHaveLength(2);
  });

  it("counts free rooms and totals per type", async () => {
    booking.getAvailableRoomsSrv.mockImplementation(async (_t: string, _i: string, _o: string, rt: string) =>
      rt === "rt-1" ? [{ id: "a" }, { id: "b" }] : [],
    );

    const a = await checkAvailability({ tenantId: "t" });

    expect(a.types.find((t) => t.name === "Reguler")).toMatchObject({ free: 2, total: 3 });
    expect(a.types.find((t) => t.name === "Deluxe")).toMatchObject({ free: 0, total: 2 });
  });

  it("treats a failed lookup for one type as zero rather than failing the answer", async () => {
    booking.getAvailableRoomsSrv.mockRejectedValue(new Error("boom"));
    const a = await checkAvailability({ tenantId: "t" });
    expect(a.types.every((t) => t.free === 0)).toBe(true);
  });
});

describe("renderAvailability — the privacy guardrail", () => {
  it("says how many are free, at what rate", async () => {
    booking.getAvailableRoomsSrv.mockImplementation(async (_t: string, _i: string, _o: string, rt: string) =>
      rt === "rt-1" ? [{ id: "a" }, { id: "b" }] : [{ id: "c" }],
    );
    const text = renderAvailability("Lor Kali", await checkAvailability({ tenantId: "t" }));

    expect(text).toContain("Reguler");
    expect(text).toContain("*2* kamar tersedia dari 3");
    expect(text).toContain("120.000");
  });

  it("says a full type is full instead of quietly omitting it", async () => {
    // A guest who asked about Reguler needs to hear "penuh", not a list that
    // happens not to mention it.
    booking.getAvailableRoomsSrv.mockResolvedValue([]);
    const text = renderAvailability("Lor Kali", await checkAvailability({ tenantId: "t", typeHint: "reguler" }));

    expect(text).toContain("Reguler");
    expect(text).toContain("penuh");
    expect(text).toContain("tanggal lain");
  });

  it("never names a room number, a guest, or a booking", async () => {
    // The structural guarantee: checkAvailability keeps only COUNTS, so there is
    // no room row, name or reference in scope for the renderer to leak. This
    // test fails loudly if someone later widens the shape.
    booking.getAvailableRoomsSrv.mockResolvedValue([
      { id: "room-1", number: "201", guest: "Budi Santoso" },
      { id: "room-2", number: "202", guest: "Siti" },
    ]);

    const text = renderAvailability("Lor Kali", await checkAvailability({ tenantId: "t" }));

    for (const secret of ["201", "202", "Budi", "Siti", "room-1", "BK-"]) {
      expect(text, `leaked ${secret}`).not.toContain(secret);
    }
    expect(text).toContain("*2* kamar tersedia");
  });

  it("handles a hotel with no room types at all", async () => {
    booking.listRoomTypes.mockResolvedValue([]);
    const text = renderAvailability("Lor Kali", await checkAvailability({ tenantId: "t" }));
    expect(text).toContain("belum ada tipe kamar");
  });

  it("invites a booking only when something is actually free", async () => {
    booking.getAvailableRoomsSrv.mockResolvedValue([{ id: "a" }]);
    expect(renderAvailability("X", await checkAvailability({ tenantId: "t" }))).toContain("Ingin kami pesankan");

    booking.getAvailableRoomsSrv.mockResolvedValue([]);
    expect(renderAvailability("X", await checkAvailability({ tenantId: "t" }))).not.toContain("Ingin kami pesankan");
  });
});
