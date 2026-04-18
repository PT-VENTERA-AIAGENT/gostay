import { supabase } from "@/lib/supabase";

export interface DashboardStats {
  totalBookingsToday: number;
  occupancyRate: number;
  revenueToday: number;
  activeChats: number;
  arrivalsToday: number;
  departuresToday: number;
  pendingBookings: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
}

export interface OccupancyPoint {
  date: string;
  occupancy: number;
  reservations: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = new Date().toISOString().split("T")[0];

  const [
    { count: totalBookingsToday },
    { count: arrivalsToday },
    { count: departuresToday },
    { count: pendingBookings },
    { count: activeChats },
    { data: rooms },
    { data: todayRevenue },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("created_at", today),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("check_in", today)
      .eq("status", "confirmed"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("check_out", today)
      .eq("status", "checked_in"),
    supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("chat_threads")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("rooms").select("id").eq("is_active", true),
    supabase
      .from("bookings")
      .select("total_amount")
      .eq("status", "checked_in")
      .gte("check_in", today),
  ]);

  const totalRooms = rooms?.length ?? 0;
  const occupiedCount = totalRooms > 0 ? (activeChats ?? 0) : 0;
  const revenueToday =
    todayRevenue?.reduce((sum, b) => sum + (b.total_amount ?? 0), 0) ?? 0;

  return {
    totalBookingsToday: totalBookingsToday ?? 0,
    occupancyRate: totalRooms > 0 ? (occupiedCount / totalRooms) * 100 : 0,
    revenueToday,
    activeChats: activeChats ?? 0,
    arrivalsToday: arrivalsToday ?? 0,
    departuresToday: departuresToday ?? 0,
    pendingBookings: pendingBookings ?? 0,
  };
}

export async function getRevenueChart(
  days = 30
): Promise<RevenuePoint[]> {
  const from = new Date();
  from.setDate(from.getDate() - days);

  const { data, error } = await supabase
    .from("bookings")
    .select("check_in, total_amount")
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .gte("check_in", from.toISOString().split("T")[0]);
  if (error) throw error;

  const map = new Map<string, number>();
  for (const b of data ?? []) {
    map.set(b.check_in, (map.get(b.check_in) ?? 0) + (b.total_amount ?? 0));
  }

  return Array.from(map.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getBookingsBySource(): Promise<
  { source: string; count: number }[]
> {
  const { data, error } = await supabase
    .from("bookings")
    .select("source");
  if (error) throw error;

  const counts = (data ?? []).reduce<Record<string, number>>((acc, b) => {
    acc[b.source] = (acc[b.source] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([source, count]) => ({ source, count }));
}

export async function getOccupancyTrend(
  days = 30
): Promise<OccupancyPoint[]> {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromStr = from.toISOString().split("T")[0];

  const [{ data: bookings }, { data: rooms }] = await Promise.all([
    supabase
      .from("bookings")
      .select("check_in, check_out")
      .in("status", ["confirmed", "checked_in", "checked_out"])
      .gte("check_in", fromStr),
    supabase.from("rooms").select("id").eq("is_active", true),
  ]);

  const totalRooms = rooms?.length ?? 1;
  const points: OccupancyPoint[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - i));
    const dateStr = d.toISOString().split("T")[0];

    const reservations = (bookings ?? []).filter(
      (b) => b.check_in <= dateStr && b.check_out > dateStr
    ).length;

    points.push({
      date: dateStr,
      reservations,
      occupancy: Math.round((reservations / totalRooms) * 100),
    });
  }

  return points;
}
