// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Chainable stand-in for the supabase-js query builder. Each table's result is
// preset; every builder method returns `this`, and awaiting resolves it.
const tableResults: Record<string, unknown> = {};

vi.mock("@/lib/supabase", () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "gte", "lte", "eq", "in", "order", "limit"]) {
      chain[m] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(tableResults[table] ?? { data: [], error: null });
    return chain;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

const { getAnalytics } = await import("./analyticsService");

const TODAY = "2026-07-15";

function booking(over: Record<string, unknown> = {}) {
  return {
    check_in: "2026-07-10",
    check_out: "2026-07-13",
    status: "checked_out",
    source: "portal",
    total_amount: 3_000_000,
    created_at: "2026-07-09T10:00:00Z",
    rooms: { number: "101", room_types: { name: "Standard" } },
    customers: { full_name: "David Santoso", nationality: "ID" },
    ...over,
  };
}

function setup(bookings: unknown[], roomCount = 10) {
  tableResults.bookings = { data: bookings, error: null };
  tableResults.rooms = { count: roomCount, error: null };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("revenue is spread across room-nights", () => {
  it("splits a stay's total evenly over the nights it covers", async () => {
    // 3,000,000 over 3 nights (10th, 11th, 12th) = 1,000,000 per night.
    setup([booking()]);
    const a = await getAnalytics(30);

    const byDate = Object.fromEntries(a.revenueTrend.map((p) => [p.date, p.revenue]));
    expect(byDate["2026-07-10"]).toBe(1_000_000);
    expect(byDate["2026-07-11"]).toBe(1_000_000);
    expect(byDate["2026-07-12"]).toBe(1_000_000);
    // The check-out day is not a night.
    expect(byDate["2026-07-13"]).toBe(0);
  });

  it("counts a stay straddling a month boundary in both months", async () => {
    // 2 nights: Jun 30 and Jul 1.
    setup([booking({ check_in: "2026-06-30", check_out: "2026-07-02", total_amount: 2_000_000 })]);
    const a = await getAnalytics(30);

    const jun = a.monthlyRevenue.find((m) => m.month === "Jun")!;
    const jul = a.monthlyRevenue.find((m) => m.month === "Jul")!;
    expect(jun.revenue).toBe(1_000_000);
    expect(jul.revenue).toBe(1_000_000);
  });

  it("ignores cancelled and no-show stays", async () => {
    setup([
      booking({ status: "cancelled" }),
      booking({ status: "no_show" }),
      booking({ status: "pending" }), // not revenue yet either
    ]);
    const a = await getAnalytics(30);
    expect(a.summary.revenueMonth).toBe(0);
    expect(a.summary.adr).toBe(0);
  });
});

describe("occupancy", () => {
  it("counts rooms held today, not chats", async () => {
    setup(
      [
        // Spans today.
        booking({ check_in: "2026-07-14", check_out: "2026-07-16", status: "checked_in" }),
        // Also spans today.
        booking({ check_in: "2026-07-15", check_out: "2026-07-18", status: "confirmed" }),
        // Ended before today.
        booking({ check_in: "2026-07-01", check_out: "2026-07-03", status: "checked_out" }),
      ],
      10,
    );
    const a = await getAnalytics(30);
    expect(a.summary.occupancyRate).toBe(20); // 2 of 10 rooms
  });

  it("releases the room on the check-out day", async () => {
    // check_out === today: the guest is leaving, the room is not occupied tonight.
    setup([booking({ check_in: "2026-07-12", check_out: TODAY, status: "checked_in" })], 10);
    const a = await getAnalytics(30);
    expect(a.summary.occupancyRate).toBe(0);
  });

  it("reports zero rather than dividing by zero when there are no rooms", async () => {
    setup([booking()], 0);
    const a = await getAnalytics(30);
    expect(a.summary.occupancyRate).toBe(0);
    expect(a.summary.revpar).toBe(0);
  });
});

describe("ADR and RevPAR", () => {
  it("computes ADR from occupied room-nights", async () => {
    // Two stays, 3 nights each at 1,000,000/night = 6 room-nights, 6,000,000.
    setup([booking(), booking()], 10);
    const a = await getAnalytics(30);
    expect(a.summary.adr).toBe(1_000_000);
  });

  it("computes RevPAR from available room-nights, so it never exceeds ADR", async () => {
    setup([booking()], 10); // 3,000,000 over 31 days x 10 rooms = 310 available
    const a = await getAnalytics(30);
    expect(a.summary.revpar).toBeCloseTo(3_000_000 / 310, 5);
    expect(a.summary.revpar).toBeLessThan(a.summary.adr);
  });

  it("keeps RevPAR = ADR x occupancy when the hotel is fully booked", async () => {
    // 1 room, booked solid across the whole 8-day window (7 nights + today).
    setup([booking({ check_in: "2026-07-08", check_out: "2026-07-16", total_amount: 8_000_000 })], 1);
    const a = await getAnalytics(7);
    expect(a.summary.adr).toBe(1_000_000);
    expect(a.summary.revpar).toBe(1_000_000);
  });
});

describe("breakdowns", () => {
  it("groups revenue by room type", async () => {
    setup([
      booking({ rooms: { number: "101", room_types: { name: "Standard" } }, total_amount: 1_000_000 }),
      booking({ rooms: { number: "201", room_types: { name: "Deluxe" } }, total_amount: 5_000_000 }),
      booking({ rooms: { number: "202", room_types: { name: "Deluxe" } }, total_amount: 3_000_000 }),
    ]);
    const a = await getAnalytics(30);
    expect(a.revenueByRoomType[0]).toEqual({ name: "Deluxe", revenue: 8_000_000 });
    expect(a.revenueByRoomType[1]).toEqual({ name: "Standard", revenue: 1_000_000 });
  });

  it("groups by source with counts and revenue", async () => {
    setup([
      booking({ source: "portal", total_amount: 1_000_000 }),
      booking({ source: "portal", total_amount: 2_000_000 }),
      booking({ source: "phone", total_amount: 500_000 }),
    ]);
    const a = await getAnalytics(30);
    expect(a.bySource[0]).toEqual({ source: "portal", count: 2, revenue: 3_000_000 });
    expect(a.bySource[1]).toEqual({ source: "phone", count: 1, revenue: 500_000 });
  });

  it("labels a missing nationality rather than dropping the guest", async () => {
    setup([
      booking({ customers: { full_name: "A", nationality: null } }),
      booking({ customers: { full_name: "B", nationality: "  " } }),
      booking({ customers: { full_name: "C", nationality: "ID" } }),
    ]);
    const a = await getAnalytics(30);
    expect(a.demographics).toContainEqual({ country: "Unknown", guests: 2 });
    expect(a.demographics).toContainEqual({ country: "ID", guests: 1 });
  });

  it("puts arrivals and departures on the right weekday", async () => {
    // 2026-07-13 is a Monday; 2026-07-15 a Wednesday.
    setup([booking({ check_in: "2026-07-13", check_out: "2026-07-15" })]);
    const a = await getAnalytics(30);
    expect(a.weekdayTrend.find((d) => d.day === "Mon")!.arrivals).toBe(1);
    expect(a.weekdayTrend.find((d) => d.day === "Wed")!.departures).toBe(1);
    expect(a.weekdayTrend[0].day).toBe("Mon"); // Monday-first
  });
});

describe("today's movements", () => {
  it("lists arrivals for today and excludes cancelled ones", async () => {
    setup([
      booking({ check_in: TODAY, check_out: "2026-07-18", status: "confirmed" }),
      booking({ check_in: TODAY, check_out: "2026-07-18", status: "cancelled" }),
      booking({ check_in: "2026-07-14", check_out: "2026-07-18", status: "confirmed" }),
    ]);
    const a = await getAnalytics(30);
    expect(a.arrivalsToday).toHaveLength(1);
    expect(a.arrivalsToday[0]).toMatchObject({ room: "101", roomType: "Standard", status: "confirmed" });
  });

  it("lists departures for today", async () => {
    setup([
      booking({ check_in: "2026-07-12", check_out: TODAY, status: "checked_in" }),
      booking({ check_in: "2026-07-12", check_out: "2026-07-20", status: "checked_in" }),
    ]);
    const a = await getAnalytics(30);
    expect(a.departuresToday).toHaveLength(1);
  });
});

describe("reservations made per day", () => {
  it("groups by the day the booking was created, not the stay date", async () => {
    setup([
      booking({ created_at: `${TODAY}T08:00:00Z`, check_in: "2026-12-01", check_out: "2026-12-03" }),
      booking({ created_at: `${TODAY}T09:00:00Z` }),
      booking({ created_at: "2026-07-14T09:00:00Z" }),
    ]);
    const a = await getAnalytics(30);

    const last = a.reservationsTrend.at(-1)!;
    expect(a.reservationsTrend).toHaveLength(7);
    expect(last.booked).toBe(2); // both created today, despite a December stay
    expect(a.quickStats.bookingsCreatedToday).toBe(2);
  });

  it("splits out bookings that later fell through", async () => {
    setup([
      booking({ created_at: `${TODAY}T08:00:00Z`, status: "confirmed" }),
      booking({ created_at: `${TODAY}T09:00:00Z`, status: "cancelled" }),
      booking({ created_at: `${TODAY}T10:00:00Z`, status: "no_show" }),
    ]);
    const a = await getAnalytics(30);
    const last = a.reservationsTrend.at(-1)!;
    expect(last.booked).toBe(1);
    expect(last.cancelled).toBe(2);
  });
});

describe("empty state", () => {
  it("returns zeroes rather than NaN when there are no bookings", async () => {
    setup([], 10);
    const a = await getAnalytics(30);
    expect(a.summary.revenueToday).toBe(0);
    expect(a.summary.adr).toBe(0);
    expect(a.summary.revpar).toBe(0);
    expect(a.summary.occupancyRate).toBe(0);
    expect(a.revenueByRoomType).toEqual([]);
    // The trend still spans the range, just flat.
    expect(a.occupancyTrend).toHaveLength(31);
    expect(a.occupancyTrend.every((p) => p.occupancy === 0)).toBe(true);
  });
});
