// Service-role room-service helpers for the WhatsApp flow. The guest portal lets
// an in-house guest order off the hotel's POS menu (src/hooks/usePortalOrder.ts →
// src/services/guestRequestService.createRoomServiceOrder); this is the
// server-side twin of exactly that path, so a WhatsApp order is indistinguishable
// from a portal one to staff — it lands in the same "Permintaan Tamu" queue and
// is posted to the room folio via the same POS "ke folio" flow.
//
// Like the rest of api/_lib/wa, every query runs under the service_role key
// (which bypasses RLS) with an EXPLICIT tenant_id — the tenant boundary RLS
// gives the browser has to be re-imposed by hand here. It deliberately does NOT
// import @supabase/supabase-js or src/services/*; it talks to PostgREST through
// the raw service-role fetch helpers in client.ts, same as booking.ts.

import { serviceGet, serviceInsert } from "./client";

// ─── Shapes ──────────────────────────────────────────────────────────────────

/** The active stay a room-service order is billed to. */
export interface InhouseStay {
  bookingId: string;
  roomId: string | null;
  roomNumber: string | null;
}

/** The pos_products columns a menu pick needs. */
export interface MenuProduct {
  id: string;
  name: string;
  category: string;
  price: number;
}

/** One resolved order line: a menu product with the chosen quantity. */
export interface OrderLine extends MenuProduct {
  quantity: number;
}

// ─── In-house stay lookup ──────────────────────────────────────────────────────

/**
 * The guest's active (checked_in) stay within one tenant, or null.
 *
 * Room service is only for guests actually staying — the same rule the portal
 * enforces (PortalOrder picks `bookings.find(b => b.status === "checked_in")`
 * and migration 021's RLS pins the insert to a checked_in booking). We resolve
 * it here by customer, newest first, and read back the room number for the reply.
 */
export async function getInhouseStay(
  tenantId: string,
  customerId: string,
): Promise<InhouseStay | null> {
  const res = await serviceGet(
    `bookings?tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&customer_id=eq.${encodeURIComponent(customerId)}` +
      `&status=eq.checked_in` +
      `&order=created_at.desc&limit=1` +
      `&select=id,room_id,rooms(number)`,
  );
  if (!res.ok) throw new Error(`wa_inhouse_lookup_failed_${res.status}`);
  const rows = (await res.json()) as Array<{
    id: string;
    room_id: string | null;
    rooms: { number: string | null } | null;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    bookingId: row.id,
    roomId: row.room_id ?? null,
    roomNumber: row.rooms?.number ?? null,
  };
}

// ─── Menu ──────────────────────────────────────────────────────────────────────

/**
 * The tenant's active POS menu, ordered category then name — the same set the
 * portal shows (posService.listProducts(true)). Empty when the hotel has no
 * active products or the read fails.
 */
export async function listMenuProducts(tenantId: string): Promise<MenuProduct[]> {
  const res = await serviceGet(
    `pos_products?tenant_id=eq.${encodeURIComponent(tenantId)}&is_active=eq.true` +
      `&select=id,name,category,price&order=category.asc,name.asc`,
  );
  if (!res.ok) return [];
  return (await res.json()) as MenuProduct[];
}

// ─── Order insert ────────────────────────────────────────────────────────────

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

/**
 * Create the room-service order, service-role, tenant_id explicit.
 *
 * A byte-for-byte mirror of guestRequestService.createRoomServiceOrder: the same
 * guest_requests row shape (title "Room service — N item", the picked lines +
 * total rendered into the description) so staff read a WhatsApp order exactly
 * like a portal one. tenant_id is passed explicitly because set_tenant_id() only
 * fills it when null and the service role has no auth.uid() to resolve it from.
 */
export async function createWaRoomServiceOrder(args: {
  tenantId: string;
  customerId: string;
  bookingId: string;
  roomId: string | null;
  items: OrderLine[];
  createdBy: string;
}): Promise<{ id: string }> {
  const total = args.items.reduce((s, it) => s + it.price * it.quantity, 0);
  const count = args.items.reduce((s, it) => s + it.quantity, 0);
  const lines = args.items.map((it) => `${it.quantity}× ${it.name} — ${idr(it.price * it.quantity)}`);
  const description = [...lines, `Total: ${idr(total)}`].join("\n");

  const res = await serviceInsert(
    "guest_requests",
    {
      tenant_id: args.tenantId,
      title: `Room service — ${count} item`,
      description,
      priority: "normal",
      room_id: args.roomId,
      booking_id: args.bookingId,
      customer_id: args.customerId,
      created_by: args.createdBy,
    },
    "return=representation",
  );

  if (!res.ok) throw new Error(`wa_room_service_insert_failed_${res.status}`);
  const rows = (await res.json()) as Array<{ id: string }>;
  const row = rows[0];
  if (!row?.id) throw new Error("wa_room_service_insert_no_row");
  return { id: row.id };
}
