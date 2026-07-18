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

// Re-exported because callers import these from the service, not from the type
// module — useBookings.ts and the portal pages already did, which TS rejected:
// an `import type` is local to the file unless it is passed on.
export type {
  Booking,
  BookingInsert,
  BookingUpdate,
  BookingWithRelations,
  BookingAuditLog,
  BookingStatus,
  Customer,
  CustomerInsert,
};

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
    // Match booking reference OR guest name. PostgREST cannot put an embedded
    // column (customers.full_name) inside a top-level or(), so resolve the
    // matching customers first, then filter by reference or their ids.
    const { data: matched } = await supabase
      .from("customers")
      .select("id")
      .ilike("full_name", `%${search}%`)
      .limit(50);
    const ids = (matched ?? []).map((c) => c.id);
    const parts = [`reference.ilike.%${search}%`];
    if (ids.length) parts.push(`customer_id.in.(${ids.join(",")})`);
    query = query.or(parts.join(","));
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data as BookingWithRelations[], count: count ?? 0 };
}

/**
 * Every booking that touches [rangeStart, rangeEnd) — for the calendar grid.
 *
 * Not expressible through getBookings(): its dateFrom/dateTo both filter
 * `check_in`, so `check_in >= rangeStart` drops the guest who arrived last week
 * and is still in the room. That is the one booking the grid most needs to
 * draw, because it is the reason the room is not free tonight.
 *
 * Overlap is the half-open test — a stay overlaps the window when it starts
 * before the window ends and ends after the window starts. check_out is an
 * exclusive bound (the guest leaves that morning), hence `gt` not `gte`.
 */
export async function getBookingsInRange(
  rangeStart: string,
  rangeEnd: string,
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
    .lt("check_in", rangeEnd)
    .gt("check_out", rangeStart)
    // Cancelled and no-show stays free the room, so they are not drawn.
    .in("status", ["pending", "confirmed", "checked_in", "checked_out"])
    .order("check_in");
  if (error) throw error;
  return data as unknown as BookingWithRelations[];
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

/**
 * Staff-side lookup. Matching on email only works for a caller who can see every
 * customer row — "Staff/admin can view all customers" in 002_rls_policies.sql.
 * A signed-in guest sees only their own record, so the lookup would always miss
 * and they would accumulate a duplicate customer row per booking. The portal
 * uses getOrCreateOwnCustomer below instead.
 */
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

/**
 * The portal's customer record for the signed-in user, created on first booking.
 *
 * profile_id is what ties a booking to a person: every "own bookings" policy
 * resolves customer_id through `customers where profile_id = auth.uid()`. It
 * used to be passed as null here, which quietly severed that chain — the row was
 * created, the booking succeeded, and the guest could then never see it again.
 */
export async function getOrCreateOwnCustomer(
  profileId: string,
  payload: Omit<CustomerInsert, "profile_id">
): Promise<Customer> {
  // limit(1) rather than maybeSingle(): if a profile ever has more than one
  // customer row (e.g. staff created one by email before the guest self-served),
  // maybeSingle() throws and takes chat/booking down with it. Take the oldest.
  const { data: rows, error: lookupError } = await supabase
    .from("customers")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (lookupError) throw lookupError;
  const existing = rows?.[0];

  if (existing) {
    // Keep contact details current, but never re-point profile_id.
    const { data, error } = await supabase
      .from("customers")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ ...payload, profile_id: profileId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Every booking belonging to the signed-in user, newest stay first.
 *
 * Keyed on customers.profile_id rather than an email or a customer id the
 * browser supplies: that column is the same one "Customer can view own
 * bookings" resolves in 002_rls_policies.sql, so the query asks for exactly
 * what RLS would return anyway. !inner makes the join a filter rather than a
 * left join — without it a booking whose customer does not match still comes
 * back, with `customers` set to null.
 */
export async function getMyBookings(
  profileId: string
): Promise<BookingWithRelations[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      customers!inner ( id, full_name, email, phone, nationality, profile_id ),
      rooms (
        *,
        room_types ( id, name, base_rate )
      )
    `
    )
    .eq("customers.profile_id", profileId)
    .order("check_in", { ascending: false });
  if (error) throw error;
  return data as unknown as BookingWithRelations[];
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
