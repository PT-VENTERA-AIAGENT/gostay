import { supabase } from "@/lib/supabase";
import type {
  Booking,
  BookingInsert,
  BookingUpdate,
  BookingWithRelations,
  BookingAuditLog,
  BookingAuditLogInsert,
  BookingStatus,
  Customer,
  CustomerInsert,
} from "@/types/database.types";

// ─── Bookings ─────────────────────────────────────────────────────────────────

export interface BookingFilters {
  status?: BookingStatus | "all";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function getBookings(
  filters: BookingFilters = {}
): Promise<{ data: BookingWithRelations[]; count: number }> {
  const { status, search, dateFrom, dateTo, page = 1, pageSize = 50 } = filters;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("bookings")
    .select(
      `
      *,
      customers ( id, full_name, email, phone, nationality ),
      rooms (
        *,
        room_types ( id, name, base_rate )
      )
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (status && status !== "all") query = query.eq("status", status);
  if (dateFrom) query = query.gte("check_in", dateFrom);
  if (dateTo) query = query.lte("check_in", dateTo);
  if (search) {
    query = query.or(
      `reference.ilike.%${search}%,customers.full_name.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data as BookingWithRelations[], count: count ?? 0 };
}

export async function getBookingById(id: string): Promise<BookingWithRelations> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      customers ( id, full_name, email, phone, nationality ),
      rooms (
        *,
        room_types ( id, name, base_rate )
      )
    `
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as BookingWithRelations;
}

export async function getBookingByReference(
  reference: string
): Promise<BookingWithRelations> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      customers ( id, full_name, email, phone, nationality ),
      rooms (
        *,
        room_types ( id, name, base_rate )
      )
    `
    )
    .eq("reference", reference)
    .single();
  if (error) throw error;
  return data as BookingWithRelations;
}

export async function createBooking(
  payload: BookingInsert
): Promise<Booking> {
  const { data, error } = await supabase
    .from("bookings")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
  performedBy: string,
  note?: string
): Promise<Booking> {
  const { data, error } = await supabase
    .from("bookings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  // Write audit log entry
  await addAuditLog({
    booking_id: id,
    action: status,
    performed_by: performedBy,
    note: note ?? null,
  });

  return data;
}

export async function updateBooking(
  id: string,
  payload: BookingUpdate,
  performedBy: string
): Promise<Booking> {
  const { data, error } = await supabase
    .from("bookings")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  await addAuditLog({
    booking_id: id,
    action: "updated",
    performed_by: performedBy,
    note: null,
  });

  return data;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function getAuditLog(
  bookingId: string
): Promise<BookingAuditLog[]> {
  const { data, error } = await supabase
    .from("booking_audit_log")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export interface ActivityEntry extends BookingAuditLog {
  bookings: { reference: string; rooms: { number: string } | null } | null;
  profiles: { full_name: string } | null;
}

/**
 * Recent activity across every booking, for the dashboard feed.
 *
 * booking_audit_log is the only activity trail the schema keeps — there is no
 * housekeeping or maintenance log, so those never appear here.
 */
export async function getRecentActivity(limit = 6): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from("booking_audit_log")
    .select(
      `*,
       bookings ( reference, rooms ( number ) ),
       profiles!booking_audit_log_performed_by_fkey ( full_name )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as ActivityEntry[];
}

async function addAuditLog(payload: BookingAuditLogInsert): Promise<void> {
  const { error } = await supabase.from("booking_audit_log").insert(payload);
  if (error) console.error("Failed to write audit log:", error);
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function searchCustomers(query: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .or(
      `full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`
    )
    .limit(10);
  if (error) throw error;
  return data;
}

export async function getOrCreateCustomer(
  payload: CustomerInsert
): Promise<Customer> {
  const { data: existing } = await supabase
    .from("customers")
    .select("*")
    .eq("email", payload.email)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCustomerBookings(
  customerId: string
): Promise<BookingWithRelations[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      customers ( id, full_name, email, phone, nationality ),
      rooms (
        *,
        room_types ( id, name, base_rate )
      )
    `
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as BookingWithRelations[];
}

// ─── Dashboard helpers ────────────────────────────────────────────────────────

export async function getTodayArrivals(): Promise<BookingWithRelations[]> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `*, customers ( id, full_name ), rooms ( number, room_types ( name ) )`
    )
    .eq("check_in", today)
    .eq("status", "confirmed");
  if (error) throw error;
  return data as BookingWithRelations[];
}

export async function getTodayDepartures(): Promise<BookingWithRelations[]> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `*, customers ( id, full_name ), rooms ( number, room_types ( name ) )`
    )
    .eq("check_out", today)
    .eq("status", "checked_in");
  if (error) throw error;
  return data as BookingWithRelations[];
}
