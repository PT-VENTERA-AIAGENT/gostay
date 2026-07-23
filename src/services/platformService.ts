import { supabase } from "@/lib/supabase";

// Cross-hotel data for the Ventera platform console. Every read here relies on
// the admin platform-wide RLS policies (migration 018 + 033): an admin sees all
// hotels, a non-admin sees nothing extra. Untyped cast — these shapes join
// across tables not in the generated types.
const db = supabase as unknown as { from: (table: string) => any };

export interface HotelOverview {
  tenant_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  mode: "live" | "test";
  payments_active: boolean;
  wa_linked: boolean;
  wa_session_id: string | null;
}

/** Every hotel with its payment mode + whether a WhatsApp session is linked. */
export async function listHotels(): Promise<HotelOverview[]> {
  const { data, error } = await db
    .from("tenants")
    .select("id,name,slug,is_active,hotel_payment_config(mode,is_active),wa_hotel_sessions(session_id,is_active)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((t: any) => {
    const cfg = Array.isArray(t.hotel_payment_config) ? t.hotel_payment_config[0] : t.hotel_payment_config;
    const wa = Array.isArray(t.wa_hotel_sessions)
      ? t.wa_hotel_sessions.find((s: any) => s.is_active) ?? t.wa_hotel_sessions[0]
      : t.wa_hotel_sessions;
    return {
      tenant_id: t.id,
      name: t.name,
      slug: t.slug,
      is_active: t.is_active,
      mode: cfg?.mode === "live" ? "live" : "test",
      payments_active: cfg?.is_active ?? true,
      wa_linked: Boolean(wa?.session_id),
      wa_session_id: wa?.session_id ?? null,
    } as HotelOverview;
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
