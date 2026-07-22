// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  findRoomType,
  getAvailableRoomsSrv,
  computeTotal,
  createWaBooking,
} from "./booking";

const TENANT = "11111111-1111-4111-8111-111111111111";

/** Stands in for Supabase PostgREST — no real DB, no real network. */
interface MockState {
  roomTypes: Array<{
    id: string;
    tenant_id: string;
    name: string;
    base_rate: number;
    max_occupancy: number;
    is_active: boolean;
  }>;
  rooms: Array<{
    id: string;
    tenant_id: string;
    room_type_id: string;
    number: string;
    is_active: boolean;
  }>;
  bookings: Array<{
    room_id: string;
    tenant_id: string;
    status: string;
    check_in: string;
    check_out: string;
  }>;
  bookingInserts: Array<Record<string, unknown>>;
}

let server: Server;
let state: MockState;

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });
}

/** Strip a PostgREST `op.value` operator prefix, returning [op, value]. */
function op(param: string | null): [string, string] {
  if (param == null) return ["", ""];
  const i = param.indexOf(".");
  return i === -1 ? ["eq", param] : [param.slice(0, i), param.slice(i + 1)];
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const p = url.searchParams;

    // ── room_types (findRoomType) ──
    if (url.pathname === "/rest/v1/room_types" && req.method === "GET") {
      const [, tenant] = op(p.get("tenant_id"));
      let rows = state.roomTypes.filter(
        (rt) => rt.tenant_id === tenant && rt.is_active,
      );
      const nameFilter = p.get("name");
      if (nameFilter) {
        // ilike.*hint*  →  case-insensitive substring
        const [, pattern] = op(nameFilter);
        const needle = pattern.replace(/\*/g, "").toLowerCase();
        rows = rows.filter((rt) => rt.name.toLowerCase().includes(needle));
      }
      const order = p.get("order");
      if (order === "base_rate.asc") {
        rows = [...rows].sort((a, b) => a.base_rate - b.base_rate);
      }
      const limit = Number(p.get("limit") ?? 0);
      if (limit) rows = rows.slice(0, limit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          rows.map((rt) => ({
            id: rt.id,
            name: rt.name,
            base_rate: rt.base_rate,
            max_occupancy: rt.max_occupancy,
          })),
        ),
      );
      return;
    }

    // ── rooms (getAvailableRoomsSrv, step 1) ──
    if (url.pathname === "/rest/v1/rooms" && req.method === "GET") {
      const [, tenant] = op(p.get("tenant_id"));
      const [, roomType] = op(p.get("room_type_id"));
      const rows = state.rooms.filter(
        (r) =>
          r.tenant_id === tenant &&
          r.room_type_id === roomType &&
          r.is_active,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          rows.map((r) => ({ id: r.id, room_type_id: r.room_type_id })),
        ),
      );
      return;
    }

    // ── bookings ──
    if (url.pathname === "/rest/v1/bookings") {
      if (req.method === "GET") {
        // getAvailableRoomsSrv, step 2: overlapping active bookings.
        const [, tenant] = op(p.get("tenant_id"));
        const [, roomIdList] = op(p.get("room_id")); // in.(a,b,c)
        const inSet = new Set(
          roomIdList.replace(/^\(|\)$/g, "").split(",").filter(Boolean),
        );
        const [, statusList] = op(p.get("status")); // in.(confirmed,checked_in)
        const statuses = new Set(
          statusList.replace(/^\(|\)$/g, "").split(",").filter(Boolean),
        );
        const [, checkInBound] = op(p.get("check_in")); // lt.<checkOut>
        const [, checkOutBound] = op(p.get("check_out")); // gt.<checkIn>
        const rows = state.bookings.filter(
          (b) =>
            b.tenant_id === tenant &&
            inSet.has(b.room_id) &&
            statuses.has(b.status) &&
            b.check_in < checkInBound &&
            b.check_out > checkOutBound,
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(rows.map((b) => ({ room_id: b.room_id }))));
        return;
      }
      if (req.method === "POST") {
        const row = JSON.parse(await readBody(req));
        state.bookingInserts.push(row);
        // Emulate the set_booking_reference BEFORE INSERT trigger.
        const stored = { id: "booking-uuid-1", reference: "BK-20260718-AB3D", ...row };
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify([stored]));
        return;
      }
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = {
    roomTypes: [
      { id: "rt-deluxe", tenant_id: TENANT, name: "Deluxe Suite", base_rate: 750000, max_occupancy: 3, is_active: true },
      { id: "rt-standard", tenant_id: TENANT, name: "Standard", base_rate: 400000, max_occupancy: 2, is_active: true },
      // Another tenant's type with the same word — must never leak.
      { id: "rt-other", tenant_id: "other-tenant", name: "Deluxe Villa", base_rate: 100, max_occupancy: 2, is_active: true },
    ],
    rooms: [
      { id: "room-1", tenant_id: TENANT, room_type_id: "rt-deluxe", number: "101", is_active: true },
      { id: "room-2", tenant_id: TENANT, room_type_id: "rt-deluxe", number: "102", is_active: true },
    ],
    bookings: [],
    bookingInserts: [],
  };
});

describe("findRoomType", () => {
  it("matches the hint case-insensitively, scoped to the tenant", async () => {
    const rt = await findRoomType(TENANT, "deluxe");
    expect(rt).not.toBeNull();
    expect(rt!.id).toBe("rt-deluxe");
    expect(rt!.name).toBe("Deluxe Suite");
    expect(rt!.base_rate).toBe(750000);
    expect(rt!.max_occupancy).toBe(3);
  });

  it("falls back to the cheapest active type when there is no hint", async () => {
    const rt = await findRoomType(TENANT, null);
    expect(rt!.id).toBe("rt-standard");
  });

  it("returns null when nothing matches", async () => {
    const rt = await findRoomType(TENANT, "penthouse");
    expect(rt).toBeNull();
  });
});

describe("getAvailableRoomsSrv", () => {
  it("excludes a room with an overlapping active booking", async () => {
    state.bookings = [
      { room_id: "room-1", tenant_id: TENANT, status: "confirmed", check_in: "2026-07-20", check_out: "2026-07-22" },
    ];
    const free = await getAvailableRoomsSrv(TENANT, "2026-07-21", "2026-07-23", "rt-deluxe");
    expect(free.map((r) => r.id)).toEqual(["room-2"]);
  });

  it("excludes a room held by a PENDING booking — WA bookings hold their room", async () => {
    // Regression: pending stays used to be ignored, so the same room double-booked.
    state.bookings = [
      { room_id: "room-1", tenant_id: TENANT, status: "pending", check_in: "2026-07-20", check_out: "2026-07-22" },
    ];
    const free = await getAvailableRoomsSrv(TENANT, "2026-07-21", "2026-07-23", "rt-deluxe");
    expect(free.map((r) => r.id)).toEqual(["room-2"]);
  });

  it("keeps a room whose booking is cancelled (only cancelled/no-show/checked_out free it)", async () => {
    state.bookings = [
      { room_id: "room-1", tenant_id: TENANT, status: "cancelled", check_in: "2026-07-20", check_out: "2026-07-22" },
    ];
    const free = await getAvailableRoomsSrv(TENANT, "2026-07-21", "2026-07-23", "rt-deluxe");
    expect(free.map((r) => r.id).sort()).toEqual(["room-1", "room-2"]);
  });

  it("treats a same-day turnover as free (half-open range)", async () => {
    state.bookings = [
      { room_id: "room-1", tenant_id: TENANT, status: "confirmed", check_in: "2026-07-18", check_out: "2026-07-21" },
    ];
    // New stay starts exactly when the old one ends: no conflict.
    const free = await getAvailableRoomsSrv(TENANT, "2026-07-21", "2026-07-23", "rt-deluxe");
    expect(free.map((r) => r.id).sort()).toEqual(["room-1", "room-2"]);
  });

  it("returns [] for an inverted / zero-night range", async () => {
    const free = await getAvailableRoomsSrv(TENANT, "2026-07-23", "2026-07-23", "rt-deluxe");
    expect(free).toEqual([]);
  });
});

describe("computeTotal", () => {
  it("multiplies whole nights by the base rate", () => {
    expect(computeTotal(750000, "2026-07-20", "2026-07-22")).toEqual({
      nights: 2,
      total: 1500000,
    });
  });
});

describe("createWaBooking", () => {
  it("posts a pending whatsapp booking with tenant_id explicit and no reference", async () => {
    const result = await createWaBooking({
      tenantId: TENANT,
      customerId: "cust-1",
      roomId: "room-2",
      checkIn: "2026-07-20",
      checkOut: "2026-07-22",
      guests: 2,
      total: 1500000,
      createdBy: "profile-1",
    });

    expect(result).toEqual({ id: "booking-uuid-1", reference: "BK-20260718-AB3D" });

    expect(state.bookingInserts).toHaveLength(1);
    const row = state.bookingInserts[0];
    expect(row).toMatchObject({
      tenant_id: TENANT,
      customer_id: "cust-1",
      room_id: "room-2",
      check_in: "2026-07-20",
      check_out: "2026-07-22",
      num_adults: 2,
      num_children: 0,
      status: "pending",
      payment_status: "pending",
      amount_paid: 0,
      total_amount: 1500000,
      source: "whatsapp",
      created_by: "profile-1",
    });
    // reference is trigger-generated — never sent by the client.
    expect(row).not.toHaveProperty("reference");
    // A WA guest can never create a confirmed (free) stay.
    expect(row.status).not.toBe("confirmed");
  });
});
