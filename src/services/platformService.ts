import { platformDb } from "@/lib/supabase";

// Cross-hotel data for the Ventera platform console.
//
// Deliberately on `platformDb`, not the app-wide `supabase` client: only this
// client sends `x-platform-scope: all`, and only with that header do the
// platform policies (035) open up beyond one tenant. The hotel-facing pages
// share the plain client and therefore stay tenant-scoped even when the viewer
// is a Ventera operator — the separation the console needs to be its own world.
//
// Untyped cast — these shapes join across tables not in the generated types.
const db = platformDb as unknown as { from: (table: string) => any };

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

// ─── Pesan (lintas hotel) ─────────────────────────────────────────────────────

export interface PlatformThread {
  id: string;
  tenant_id: string;
  hotel: string;
  guest: string;
  guest_profile_id: string | null;
  phone: string | null;
  status: string;
  updated_at: string;
  last_message: string | null;
  unread: number;
}

export interface PlatformMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  attachment_url: string | null;
  created_at: string;
}

/**
 * Every hotel's conversations, newest first.
 *
 * The console reads this instead of the hotel Pesan page doing it implicitly:
 * that page is now tenant-scoped for everyone (035), so all-hotel chat lives
 * here — labelled with the hotel it belongs to, which the mixed inbox never was.
 */
export async function listAllThreads(limit = 200): Promise<PlatformThread[]> {
  const { data, error } = await db
    .from("chat_threads")
    .select("id,tenant_id,status,updated_at,tenants(name),customers(full_name,phone,profile_id)")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  // One extra query for the preview line + unread count, rather than an embed
  // per thread (the embed cannot be ordered-and-limited per parent row here).
  const ids = rows.map((t) => t.id);
  const { data: msgs } = await db
    .from("chat_messages")
    .select("thread_id,content,created_at,is_read,sender_id")
    .in("thread_id", ids)
    .order("created_at", { ascending: false });

  const latest = new Map<string, string>();
  const unread = new Map<string, number>();
  for (const m of (msgs ?? []) as any[]) {
    if (!latest.has(m.thread_id)) latest.set(m.thread_id, m.content);
    if (!m.is_read) unread.set(m.thread_id, (unread.get(m.thread_id) ?? 0) + 1);
  }

  return rows.map((t) => ({
    id: t.id,
    tenant_id: t.tenant_id,
    hotel: t.tenants?.name ?? "—",
    guest: t.customers?.full_name ?? "—",
    guest_profile_id: t.customers?.profile_id ?? null,
    phone: t.customers?.phone ?? null,
    status: t.status,
    updated_at: t.updated_at,
    last_message: latest.get(t.id) ?? null,
    unread: unread.get(t.id) ?? 0,
  }));
}

/** The full transcript of one thread. Read-only: the console never replies. */
export async function listThreadMessages(threadId: string): Promise<PlatformMessage[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("id,thread_id,sender_id,content,attachment_url,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlatformMessage[];
}

// ─── Saldo (lintas hotel) ─────────────────────────────────────────────────────

export interface PlatformBalance {
  tenant_id: string;
  hotel: string;
  balance: number;         // hotel_balance.available (net, withdrawable)
  pending_payout: number;  // payouts still 'pending'
  lifetime_in: number;     // hotel_balance.lifetime_gross (total reservation income)
}

/**
 * Every hotel's wallet. hotel_balance holds the running figures; payouts still
 * awaiting processing are summed separately so the console can see what Ventera
 * owes before anyone asks.
 *
 * Columns are `available` and `lifetime_gross` (see 031) — NOT `balance`/
 * `lifetime_in`, which do not exist and made this query error out. The public
 * PlatformBalance shape keeps the friendlier names, mapped here.
 */
export async function listAllBalances(): Promise<PlatformBalance[]> {
  const [tenantsRes, balRes, payoutRes] = await Promise.all([
    db.from("tenants").select("id,name").order("name"),
    db.from("hotel_balance").select("tenant_id,available,lifetime_gross"),
    db.from("payouts").select("tenant_id,amount,status"),
  ]);
  if (tenantsRes.error) throw tenantsRes.error;
  if (balRes.error) throw balRes.error;

  const byTenant = new Map<string, any>();
  for (const b of (balRes.data ?? []) as any[]) byTenant.set(b.tenant_id, b);
  const pending = new Map<string, number>();
  for (const p of (payoutRes.data ?? []) as any[]) {
    if (p.status !== "pending") continue;
    pending.set(p.tenant_id, (pending.get(p.tenant_id) ?? 0) + Number(p.amount ?? 0));
  }

  return (tenantsRes.data ?? []).map((t: any) => ({
    tenant_id: t.id,
    hotel: t.name,
    balance: Number(byTenant.get(t.id)?.available ?? 0),
    lifetime_in: Number(byTenant.get(t.id)?.lifetime_gross ?? 0),
    pending_payout: pending.get(t.id) ?? 0,
  }));
}

// ─── Kalender hunian (lintas hotel) ───────────────────────────────────────────

export interface PlatformCalendarDay {
  date: string;
  /** tenant_id → rooms occupied that night. */
  byHotel: Record<string, number>;
}

export interface PlatformCalendar {
  hotels: Array<{ tenant_id: string; name: string; rooms: number }>;
  days: PlatformCalendarDay[];
}

/**
 * Occupancy per hotel per night over a window, in one pass.
 *
 * A booking occupies a room on every night in [check_in, check_out) — the same
 * half-open rule as the room board and the WhatsApp bot, so the calendar cannot
 * disagree with what the AI quotes. `days` is expanded client-side from the
 * bookings that overlap the window, which is one query instead of one per day.
 */
export async function getPlatformCalendar(from: string, days: number): Promise<PlatformCalendar> {
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(start.getTime() + days * 86400000);
  const endIso = end.toISOString().slice(0, 10);

  const [tenantsRes, roomsRes, bookingsRes] = await Promise.all([
    db.from("tenants").select("id,name").order("name"),
    db.from("rooms").select("id,tenant_id").eq("is_active", true),
    db.from("bookings").select("room_id,tenant_id,check_in,check_out")
      .in("status", ["pending", "confirmed", "checked_in"])
      .lt("check_in", endIso)
      .gt("check_out", from),
  ]);
  if (tenantsRes.error) throw tenantsRes.error;
  if (roomsRes.error) throw roomsRes.error;
  if (bookingsRes.error) throw bookingsRes.error;

  const roomCount = new Map<string, number>();
  for (const r of (roomsRes.data ?? []) as any[]) {
    roomCount.set(r.tenant_id, (roomCount.get(r.tenant_id) ?? 0) + 1);
  }

  const dayList: PlatformCalendarDay[] = [];
  for (let i = 0; i < days; i++) {
    dayList.push({ date: new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10), byHotel: {} });
  }
  // Distinct rooms per (day, tenant): two bookings on one room must count once.
  const seen = new Map<string, Set<string>>();
  for (const b of (bookingsRes.data ?? []) as any[]) {
    for (const d of dayList) {
      if (!(b.check_in <= d.date && b.check_out > d.date)) continue;
      const key = `${d.date}|${b.tenant_id}`;
      if (!seen.has(key)) seen.set(key, new Set());
      if (b.room_id) seen.get(key)!.add(b.room_id);
    }
  }
  for (const d of dayList) {
    for (const t of (tenantsRes.data ?? []) as any[]) {
      d.byHotel[t.id] = seen.get(`${d.date}|${t.id}`)?.size ?? 0;
    }
  }

  return {
    hotels: (tenantsRes.data ?? []).map((t: any) => ({
      tenant_id: t.id, name: t.name, rooms: roomCount.get(t.id) ?? 0,
    })),
    days: dayList,
  };
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

// ─── Detail satu hotel (drill-down konsol) ────────────────────────────────────

export interface HotelDetail {
  tenant_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  mode: "live" | "test";
  payments_active: boolean;
  wa_linked: boolean;
  wa_number: string | null;
  owner: HotelOwner | null;
  staff_count: number;
  // Angka operasional
  rooms_total: number;
  rooms_occupied_today: number;
  bookings_total: number;
  customers_total: number;
  // Dompet
  balance: number;
  lifetime_in: number;
  pending_payout: number;
  // Aktivitas terbaru (di hotel ini)
  recent_reservations: PlatformBooking[];
  recent_threads: PlatformThread[];
}

/**
 * Everything the console shows for ONE hotel, in a single aggregate — stats,
 * wallet, and recent reservations/conversations — so the drill-down page is one
 * query round rather than a dozen. Scoped by tenant_id; runs on platformDb, so
 * the platform policies (035) open it beyond the operator's own hotel.
 */
export async function getHotelDetail(tenantId: string): Promise<HotelDetail | null> {
  const today = new Date().toISOString().slice(0, 10);
  const [
    tenantRes, cfgRes, waRes, ownersRes, balRes, payoutRes,
    roomsRes, occRes, bookingsCountRes, customersCountRes,
    recentBkRes, threadsRes,
  ] = await Promise.all([
    db.from("tenants").select("id,name,slug,is_active").eq("id", tenantId).maybeSingle(),
    db.from("hotel_payment_config").select("mode,is_active").eq("tenant_id", tenantId).maybeSingle(),
    db.from("wa_hotel_sessions").select("bot_number,is_active").eq("tenant_id", tenantId),
    db.from("profiles").select("full_name,email,phone,role,created_at").eq("tenant_id", tenantId)
      .in("role", ["staff", "admin"]).order("created_at", { ascending: true }),
    db.from("hotel_balance").select("available,lifetime_gross").eq("tenant_id", tenantId).maybeSingle(),
    db.from("payouts").select("amount,status").eq("tenant_id", tenantId),
    db.from("rooms").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
    db.from("bookings").select("room_id").eq("tenant_id", tenantId)
      .in("status", ["pending", "confirmed", "checked_in"]).lte("check_in", today).gt("check_out", today),
    db.from("bookings").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    db.from("bookings")
      .select("id,reference,check_in,check_out,status,payment_status,total_amount,created_at,customers(full_name),rooms(number)")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(8),
    db.from("chat_threads")
      .select("id,status,updated_at,customers(full_name,phone,profile_id)")
      .eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(6),
  ]);
  if (tenantRes.error) throw tenantRes.error;
  const t = tenantRes.data as any;
  if (!t) return null;

  const cfg = cfgRes.data as any;
  const sessions = (waRes.data ?? []) as any[];
  const activeWa = sessions.find((s) => s.is_active) ?? sessions[0];
  const owners = (ownersRes.data ?? []) as any[];
  const firstOwner = owners[0];
  const bal = balRes.data as any;
  const pending = ((payoutRes.data ?? []) as any[])
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const occupied = new Set(((occRes.data ?? []) as any[]).map((b) => b.room_id).filter(Boolean)).size;

  return {
    tenant_id: t.id,
    name: t.name,
    slug: t.slug,
    is_active: t.is_active,
    mode: cfg?.mode === "live" ? "live" : "test",
    payments_active: cfg?.is_active ?? true,
    wa_linked: Boolean(sessions.find((s) => s.is_active)),
    wa_number: activeWa?.bot_number ?? null,
    owner: firstOwner
      ? {
          full_name: firstOwner.full_name ?? null,
          email: isSyntheticEmail(firstOwner.email) ? null : firstOwner.email,
          phone: firstOwner.phone ?? null,
          role: firstOwner.role,
        }
      : null,
    staff_count: owners.length,
    rooms_total: roomsRes.count ?? 0,
    rooms_occupied_today: occupied,
    bookings_total: bookingsCountRes.count ?? 0,
    customers_total: customersCountRes.count ?? 0,
    balance: Number(bal?.available ?? 0),
    lifetime_in: Number(bal?.lifetime_gross ?? 0),
    pending_payout: pending,
    recent_reservations: ((recentBkRes.data ?? []) as any[]).map((b) => ({
      id: b.id,
      reference: b.reference,
      hotel: t.name,
      guest: b.customers?.full_name ?? "—",
      room: b.rooms?.number ?? null,
      check_in: b.check_in,
      check_out: b.check_out,
      status: b.status,
      payment_status: b.payment_status,
      total_amount: Number(b.total_amount),
      created_at: b.created_at,
    })),
    recent_threads: ((threadsRes.data ?? []) as any[]).map((th) => ({
      id: th.id,
      tenant_id: t.id,
      hotel: t.name,
      guest: th.customers?.full_name ?? "—",
      guest_profile_id: th.customers?.profile_id ?? null,
      phone: th.customers?.phone ?? null,
      status: th.status,
      updated_at: th.updated_at,
      last_message: null,
      unread: 0,
    })),
  };
}
