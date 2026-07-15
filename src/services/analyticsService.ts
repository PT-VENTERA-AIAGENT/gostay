import { supabase } from "@/lib/supabase";
import type { BookingSource, BookingStatus } from "@/types/database.types";

/**
 * Analytics derived from bookings, in one round trip.
 *
 * Everything is computed from **room-nights**, not from booking totals dropped
 * on the check-in date. A three-night stay contributes to three nights of
 * revenue and three occupied room-nights, which is what makes ADR, RevPAR and
 * occupancy agree with each other instead of drifting apart.
 *
 * Statuses that count as business: confirmed, checked_in, checked_out. pending
 * is not yet revenue; cancelled and no_show never were.
 */

const EARNING_STATUSES: BookingStatus[] = ["confirmed", "checked_in", "checked_out"];
/** Holding a room right now — a checked-out stay has released it. */
const OCCUPYING_STATUSES: BookingStatus[] = ["confirmed", "checked_in"];

export interface AnalyticsSummary {
  /** Share of active rooms occupied today, 0–100. */
  occupancyRate: number;
  revenueToday: number;
  revenueMonth: number;
  revenueYear: number;
  /** Average Daily Rate: room revenue ÷ occupied room-nights, over the range. */
  adr: number;
  /** Revenue per Available Room: room revenue ÷ available room-nights. */
  revpar: number;
  totalRooms: number;

  /**
   * Percent change against a comparable earlier period, or null when there is
   * no honest comparison to draw — a null renders as no trend at all rather
   * than a made-up one. Year-on-year is always null: it would need two years
   * of history and only ~13 months are fetched.
   */
  revenueTodayDelta: number | null;
  revenueMonthDelta: number | null;
  adrDelta: number | null;
  revparDelta: number | null;
  /** Today vs the same weekday a week ago. */
  occupancyDelta: number | null;
}

/** Percent change, or null when the baseline is zero and a ratio is meaningless. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export interface OccupancyPoint { date: string; occupancy: number; reservations: number }
export interface RevenuePoint { date: string; revenue: number }
export interface NamedRevenue { name: string; revenue: number }
export interface MonthlyPoint { month: string; revenue: number; bookings: number }
export interface SourcePoint { source: BookingSource; count: number; revenue: number }
export interface WeekdayPoint { day: string; arrivals: number; departures: number }
export interface DemographicPoint { country: string; guests: number }
export interface AdrPoint { date: string; adr: number }
export interface MovementRow {
  guest: string;
  room: string;
  roomType: string;
  status: BookingStatus;
}

export interface QuickStats {
  unreadChats: number;
  followUpCalls: number;
  callsToday: number;
  bookingsCreatedToday: number;
}

/** Bookings *made* on a day, split by whether they since fell through. */
export interface ReservationPoint {
  day: string;
  booked: number;
  cancelled: number;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  quickStats: QuickStats;
  reservationsTrend: ReservationPoint[];
  occupancyTrend: OccupancyPoint[];
  revenueTrend: RevenuePoint[];
  revenueByRoomType: NamedRevenue[];
  monthlyRevenue: MonthlyPoint[];
  bySource: SourcePoint[];
  weekdayTrend: WeekdayPoint[];
  demographics: DemographicPoint[];
  adrTrend: AdrPoint[];
  arrivalsToday: MovementRow[];
  departuresToday: MovementRow[];
}

// ─── Date helpers. Dates are plain YYYY-MM-DD, as stored. ────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** Every night a stay occupies. The check-out day is not a night. */
function nightsOf(checkIn: string, checkOut: string): string[] {
  const total = nightsBetween(checkIn, checkOut);
  const out: string[] = [];
  for (let i = 0; i < total; i++) out.push(addDays(checkIn, i));
  return out;
}

interface AnalyticsBooking {
  check_in: string;
  check_out: string;
  status: BookingStatus;
  source: BookingSource;
  total_amount: number | null;
  created_at: string;
  rooms: { number: string; room_types: { name: string } | null } | null;
  customers: { full_name: string; nationality: string | null } | null;
}

export async function getAnalytics(rangeDays = 30): Promise<AnalyticsData> {
  const today = toDateStr(new Date());
  const rangeStart = addDays(today, -rangeDays);
  // Monthly revenue covers a rolling 6 months, so reach back further than the
  // selected range — and far enough that a long stay starting before it counts.
  const fetchFrom = addDays(today, -400);

  const [bookingsRes, roomsRes, unreadRes, followUpRes, callsTodayRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `check_in, check_out, status, source, total_amount, created_at,
         rooms ( number, room_types ( name ) ),
         customers ( full_name, nationality )`,
      )
      .gte("check_out", fetchFrom)
      .order("check_in"),
    supabase.from("rooms").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("chat_messages").select("id", { count: "exact", head: true }).eq("is_read", false),
    supabase.from("call_logs").select("id", { count: "exact", head: true }).eq("follow_up", true),
    // created_at is a timestamptz, so an equality test against a date string
    // would never match — bound the day instead.
    supabase.from("call_logs").select("id", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00Z`),
  ]);

  if (bookingsRes.error) throw bookingsRes.error;
  if (roomsRes.error) throw roomsRes.error;

  const bookings = (bookingsRes.data ?? []) as unknown as AnalyticsBooking[];
  const totalRooms = roomsRes.count ?? 0;

  // created_at is a timestamptz; slice to the date to group by day.
  const createdOn = (b: AnalyticsBooking) => b.created_at.slice(0, 10);

  const quickStats: QuickStats = {
    unreadChats: unreadRes.count ?? 0,
    followUpCalls: followUpRes.count ?? 0,
    callsToday: callsTodayRes.count ?? 0,
    bookingsCreatedToday: bookings.filter((b) => createdOn(b) === today).length,
  };

  // Reservations made per day over the last week, split by whether they have
  // since been cancelled — cancellation has no timestamp of its own, so this
  // reads as "of what was booked that day, how much fell through".
  const reservationsTrend: ReservationPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const made = bookings.filter((b) => createdOn(b) === date);
    reservationsTrend.push({
      day: new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" }),
      booked: made.filter((b) => b.status !== "cancelled" && b.status !== "no_show").length,
      cancelled: made.filter((b) => b.status === "cancelled" || b.status === "no_show").length,
    });
  }
  const earning = bookings.filter((b) => EARNING_STATUSES.includes(b.status));
  const inRange = (b: AnalyticsBooking) => b.check_out >= rangeStart && b.check_in <= today;

  // Spread each stay's total across the nights it covers, so a stay straddling
  // a month boundary lands in both months rather than all in one.
  const revenueByNight = new Map<string, number>();
  const roomNightsByDate = new Map<string, number>();
  for (const b of earning) {
    const nights = nightsOf(b.check_in, b.check_out);
    const perNight = (b.total_amount ?? 0) / nights.length;
    for (const n of nights) {
      revenueByNight.set(n, (revenueByNight.get(n) ?? 0) + perNight);
      roomNightsByDate.set(n, (roomNightsByDate.get(n) ?? 0) + 1);
    }
  }

  const sumBetween = (from: string, to: string) => {
    let sum = 0;
    for (const [date, rev] of revenueByNight) if (date >= from && date <= to) sum += rev;
    return sum;
  };

  const occupiedToday = bookings.filter(
    (b) => OCCUPYING_STATUSES.includes(b.status) && b.check_in <= today && b.check_out > today,
  ).length;

  // Room revenue and occupied room-nights for an arbitrary window, so the
  // current range and the one before it are measured the same way.
  const windowStats = (from: string, to: string) => {
    let revenue = 0;
    let roomNights = 0;
    for (const [date, rev] of revenueByNight) {
      if (date >= from && date <= to) {
        revenue += rev;
        roomNights += roomNightsByDate.get(date) ?? 0;
      }
    }
    return { revenue, roomNights };
  };

  const cur = windowStats(rangeStart, today);
  const prev = windowStats(addDays(rangeStart, -(rangeDays + 1)), addDays(rangeStart, -1));
  const availableRoomNights = totalRooms * (rangeDays + 1);

  const adr = cur.roomNights > 0 ? cur.revenue / cur.roomNights : 0;
  const adrPrev = prev.roomNights > 0 ? prev.revenue / prev.roomNights : 0;
  const revpar = availableRoomNights > 0 ? cur.revenue / availableRoomNights : 0;
  const revparPrev = availableRoomNights > 0 ? prev.revenue / availableRoomNights : 0;

  // Month to date vs the same span of days in the previous month, so a
  // half-finished month is not compared against a whole one.
  const monthStart = `${today.slice(0, 7)}-01`;
  const dayOfMonth = Number(today.slice(8, 10));
  const prevMonthEnd = addDays(monthStart, -1);
  const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`;
  const prevMonthSameDay = addDays(prevMonthStart, dayOfMonth - 1);

  const occupiedWeekAgo = roomNightsByDate.get(addDays(today, -7)) ?? 0;

  const summary: AnalyticsSummary = {
    occupancyRate: totalRooms > 0 ? Math.round((occupiedToday / totalRooms) * 100) : 0,
    revenueToday: sumBetween(today, today),
    revenueMonth: sumBetween(monthStart, today),
    revenueYear: sumBetween(`${today.slice(0, 4)}-01-01`, today),
    adr,
    revpar,
    totalRooms,

    revenueTodayDelta: pctChange(sumBetween(today, today), sumBetween(addDays(today, -1), addDays(today, -1))),
    revenueMonthDelta: pctChange(
      sumBetween(monthStart, today),
      sumBetween(prevMonthStart, prevMonthSameDay > prevMonthEnd ? prevMonthEnd : prevMonthSameDay),
    ),
    adrDelta: pctChange(adr, adrPrev),
    revparDelta: pctChange(revpar, revparPrev),
    occupancyDelta: pctChange(occupiedToday, occupiedWeekAgo),
  };

  const occupancyTrend: OccupancyPoint[] = [];
  const revenueTrend: RevenuePoint[] = [];
  for (let i = rangeDays; i >= 0; i--) {
    const date = addDays(today, -i);
    const reservations = roomNightsByDate.get(date) ?? 0;
    occupancyTrend.push({
      date,
      reservations,
      occupancy: totalRooms > 0 ? Math.round((reservations / totalRooms) * 100) : 0,
    });
    revenueTrend.push({ date, revenue: Math.round(revenueByNight.get(date) ?? 0) });
  }

  const byType = new Map<string, number>();
  for (const b of earning) {
    if (!inRange(b)) continue;
    const name = b.rooms?.room_types?.name ?? "Unknown";
    byType.set(name, (byType.get(name) ?? 0) + (b.total_amount ?? 0));
  }
  const revenueByRoomType = Array.from(byType, ([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const monthlyRevenue: MonthlyPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = toDateStr(d).slice(0, 7);
    let revenue = 0;
    for (const [date, rev] of revenueByNight) if (date.startsWith(key)) revenue += rev;
    monthlyRevenue.push({
      month: d.toLocaleString("en", { month: "short", timeZone: "UTC" }),
      revenue: Math.round(revenue),
      bookings: earning.filter((b) => b.check_in.startsWith(key)).length,
    });
  }

  const sourceMap = new Map<BookingSource, { count: number; revenue: number }>();
  for (const b of earning) {
    if (!inRange(b)) continue;
    const cur = sourceMap.get(b.source) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += b.total_amount ?? 0;
    sourceMap.set(b.source, cur);
  }
  const bySource = Array.from(sourceMap, ([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.count - a.count);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = new Map(DAYS.map((d) => [d, { arrivals: 0, departures: 0 }]));
  const weekdayOf = (dateStr: string) => DAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
  for (const b of earning) {
    if (b.check_in >= rangeStart && b.check_in <= today) weekday.get(weekdayOf(b.check_in))!.arrivals += 1;
    if (b.check_out >= rangeStart && b.check_out <= today) weekday.get(weekdayOf(b.check_out))!.departures += 1;
  }
  // Monday-first reads better than the Sunday-first the Date API gives us.
  const weekdayTrend: WeekdayPoint[] = [...DAYS.slice(1), DAYS[0]].map((day) => ({
    day,
    ...weekday.get(day)!,
  }));

  const nations = new Map<string, number>();
  for (const b of earning) {
    if (!inRange(b)) continue;
    const country = b.customers?.nationality?.trim() || "Unknown";
    nations.set(country, (nations.get(country) ?? 0) + 1);
  }
  const demographics = Array.from(nations, ([country, guests]) => ({ country, guests }))
    .sort((a, b) => b.guests - a.guests)
    .slice(0, 6);

  const adrTrend: AdrPoint[] = [];
  const weeks = Math.max(1, Math.ceil((rangeDays + 1) / 7));
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(today, -w * 7);
    const start = addDays(end, -6);
    let rev = 0;
    let nights = 0;
    for (const [date, r] of revenueByNight) {
      if (date >= start && date <= end) {
        rev += r;
        nights += roomNightsByDate.get(date) ?? 0;
      }
    }
    adrTrend.push({ date: `W${weeks - w}`, adr: nights > 0 ? Math.round(rev / nights) : 0 });
  }

  const toRow = (b: AnalyticsBooking): MovementRow => ({
    guest: b.customers?.full_name ?? "—",
    room: b.rooms?.number ?? "—",
    roomType: b.rooms?.room_types?.name ?? "—",
    status: b.status,
  });
  const arrivalsToday = bookings
    .filter((b) => b.check_in === today && b.status !== "cancelled" && b.status !== "no_show")
    .map(toRow);
  const departuresToday = bookings
    .filter((b) => b.check_out === today && (b.status === "checked_in" || b.status === "checked_out"))
    .map(toRow);

  return {
    summary,
    quickStats,
    reservationsTrend,
    occupancyTrend,
    revenueTrend,
    revenueByRoomType,
    monthlyRevenue,
    bySource,
    weekdayTrend,
    demographics,
    adrTrend,
    arrivalsToday,
    departuresToday,
  };
}
