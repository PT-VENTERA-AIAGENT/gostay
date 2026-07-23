import { supabase } from "@/lib/supabase";

// Cross-hotel data for the Ventera platform console. Every read here relies on
// the admin platform-wide RLS policies (migration 018 + 033): an admin sees all
// hotels, a non-admin sees nothing extra. Untyped cast — these shapes join
// across tables not in the generated types.
const db = supabase as unknown as { from: (table: string) => any };

export interface HotelOwner {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
}

export interface HotelOverview {
  tenant_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  mode: "live" | "test";
  payments_active: boolean;
  wa_linked: boolean;         // an ACTIVE WhatsApp session exists
  wa_number: string | null;   // the hotel's WhatsApp bot number, if any
  wa_session_id: string | null;
  owner: HotelOwner | null;   // the hotel's primary account (earliest staff/admin)
  staff_count: number;        // how many staff/admin accounts the hotel has
}

/** An email GoStay auto-generates for phone/WA identities (not a real inbox). */
function isSyntheticEmail(email: string | null | undefined): boolean {
  return !email || /@wa\.guest\.|@noreply\.ventera/i.test(email);
}

/**
 * Every hotel with its payment mode, WhatsApp link, AND its owner account.
 *
 * Owner = the earliest-created staff/admin profile of the tenant (the account
 * that set the hotel up). Fetched in one extra query and merged in, rather than
 * embedding profiles on tenants (which would drag in every WA-guest customer
 * profile too). Admin RLS returns staff across all hotels.
 */
export async function listHotels(): Promise<HotelOverview[]> {
  const [tenantsRes, ownersRes] = await Promise.all([
    db.from("tenants")
      .select("id,name,slug,is_active,hotel_payment_config(mode,is_active),wa_hotel_sessions(session_id,bot_number,is_active)")
      .order("name"),
    db.from("profiles")
      .select("tenant_id,full_name,email,phone,role,created_at")
      .in("role", ["staff", "admin"])
      .order("created_at", { ascending: true }),
  ]);
  if (tenantsRes.error) throw tenantsRes.error;
  if (ownersRes.error) throw ownersRes.error;

  // tenant_id -> { owner (first), count }
  const byTenant = new Map<string, { owner: HotelOwner; count: number }>();
  for (const p of (ownersRes.data ?? []) as any[]) {
    if (!p.tenant_id) continue;
    const existing = byTenant.get(p.tenant_id);
    if (existing) { existing.count += 1; continue; }
    byTenant.set(p.tenant_id, {
      owner: {
        full_name: p.full_name ?? null,
        email: isSyntheticEmail(p.email) ? null : p.email,
        phone: p.phone ?? null,
        role: p.role,
      },
      count: 1,
    });
  }

  return (tenantsRes.data ?? []).map((t: any) => {
    const cfg = Array.isArray(t.hotel_payment_config) ? t.hotel_payment_config[0] : t.hotel_payment_config;
    const sessions: any[] = Array.isArray(t.wa_hotel_sessions)
      ? t.wa_hotel_sessions
      : t.wa_hotel_sessions ? [t.wa_hotel_sessions] : [];
    const activeWa = sessions.find((s) => s.is_active);
    const anyWa = activeWa ?? sessions[0];
    const o = byTenant.get(t.id);
    return {
      tenant_id: t.id,
      name: t.name,
      slug: t.slug,
      is_active: t.is_active,
      mode: cfg?.mode === "live" ? "live" : "test",
      payments_active: cfg?.is_active ?? true,
      wa_linked: Boolean(activeWa),                 // linked only when a session is ACTIVE
      wa_number: anyWa?.bot_number ?? null,
      wa_session_id: anyWa?.session_id ?? null,
      owner: o?.owner ?? null,
      staff_count: o?.count ?? 0,
    } as HotelOverview;
  });
}

export interface HotelRoomAvailability {
  tenant_id: string;
  hotel: string;
  total: number;
  booked: number;
  available: number;
}

/**
 * Rooms free vs booked per hotel for a given date (default: today). A room is
 * "booked" on date D when an active booking overlaps it: check_in <= D < check_out
 * — the same half-open rule the room board and the WhatsApp booking bot use, so
 * this matches what the AI already enforces when it takes a reservation.
 */
export async function listRoomAvailability(date: string): Promise<HotelRoomAvailability[]> {
  const [tenantsRes, roomsRes, bookingsRes] = await Promise.all([
    db.from("tenants").select("id,name").order("name"),
    db.from("rooms").select("id,tenant_id").eq("is_active", true),
    db.from("bookings").select("room_id,tenant_id")
      .in("status", ["pending", "confirmed", "checked_in"])
      .lte("check_in", date).gt("check_out", date),
  ]);
  if (tenantsRes.error) throw tenantsRes.error;
  if (roomsRes.error) throw roomsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;

  const totalByTenant = new Map<string, number>();
  for (const r of (roomsRes.data ?? []) as any[]) {
    totalByTenant.set(r.tenant_id, (totalByTenant.get(r.tenant_id) ?? 0) + 1);
  }
  // Distinct booked rooms per tenant (guard against duplicate rows).
  const bookedRooms = new Map<string, Set<string>>();
  for (const b of (bookingsRes.data ?? []) as any[]) {
    if (!bookedRooms.has(b.tenant_id)) bookedRooms.set(b.tenant_id, new Set());
    if (b.room_id) bookedRooms.get(b.tenant_id)!.add(b.room_id);
  }

  return (tenantsRes.data ?? []).map((t: any) => {
    const total = totalByTenant.get(t.id) ?? 0;
    const booked = bookedRooms.get(t.id)?.size ?? 0;
    return { tenant_id: t.id, hotel: t.name, total, booked, available: Math.max(0, total - booked) };
  });
}

export interface PlatformBooking {
  id: string;
  reference: string;
  hotel: string;
  guest: string;
  room: string | null;
  check_in: string;
  check_out: string;
  status: string;
  payment_status: string;
  total_amount: number;
  created_at: string;
}

/** Recent reservations across ALL hotels. */
export async function listAllReservations(limit = 100): Promise<PlatformBooking[]> {
  const { data, error } = await db
    .from("bookings")
    .select("id,reference,check_in,check_out,status,payment_status,total_amount,created_at,tenants(name),customers(full_name),rooms(number)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((b: any) => ({
    id: b.id,
    reference: b.reference,
    hotel: b.tenants?.name ?? "—",
    guest: b.customers?.full_name ?? "—",
    room: b.rooms?.number ?? null,
    check_in: b.check_in,
    check_out: b.check_out,
    status: b.status,
    payment_status: b.payment_status,
    total_amount: Number(b.total_amount),
    created_at: b.created_at,
  }));
}

export interface PlatformRequest {
  id: string;
  hotel: string;
  title: string;
  status: string;
  priority: string;
  guest: string | null;
  room: string | null;
  created_at: string;
}

/** Recent guest requests across ALL hotels. */
export async function listAllGuestRequests(limit = 100): Promise<PlatformRequest[]> {
  const { data, error } = await db
    .from("guest_requests")
    .select("id,title,status,priority,created_at,tenants(name),customers(full_name),rooms(number)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    hotel: r.tenants?.name ?? "—",
    title: r.title,
    status: r.status,
    priority: r.priority,
    guest: r.customers?.full_name ?? null,
    room: r.rooms?.number ?? null,
    created_at: r.created_at,
  }));
}
