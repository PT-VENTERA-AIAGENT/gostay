// Answering "ada kamar kosong?" over WhatsApp.
//
// This exists because the honest answer to that question was a form. A guest
// asking whether anything is free got the booking flow's "mohon lengkapi data
// berikut" — five fields to fill in before learning the hotel is full. The
// question deserves an answer first; booking can follow.
//
// ─── The privacy rule, stated once ───────────────────────────────────────────
// A guest may learn WHAT IS FOR SALE. They may not learn anything about anyone
// else's stay. Concretely, this module returns:
//
//   ✅ room type names, nightly rates, how many of each are free
//   ✅ that a specific room number is or is not available
//   ❌ who is in a room, their name, phone, dates, or booking reference
//   ❌ which specific room numbers are OCCUPIED (that maps a guest to a door)
//   ❌ occupancy rates, revenue, or anything a competitor would want
//
// The shapes below carry counts, never rows, so a caller physically cannot leak
// a guest — the data never enters this layer. That is deliberate: a guardrail
// that depends on the caller remembering to redact is a guardrail that fails.

import { serviceGet } from "./client";
import { listRoomTypes, getAvailableRoomsSrv, type RoomTypeLite } from "./booking";

/** One room type's availability for a date range. Counts only, never rows. */
export interface TypeAvailability {
  id: string;
  name: string;
  baseRate: number;
  maxOccupancy: number | null;
  /** How many rooms of this type are free for the whole range. */
  free: number;
  /** How many rooms of this type the hotel has at all. */
  total: number;
}

export interface AvailabilityResult {
  checkIn: string;
  checkOut: string;
  nights: number;
  types: TypeAvailability[];
  /** True when the guest named a type and we could resolve it. */
  narrowed: boolean;
}

/** Add whole days to YYYY-MM-DD (UTC midnight, DST-safe). */
function addDays(iso: string, days: number): string {
  return new Date(new Date(iso + "T00:00:00Z").getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Today in Asia/Jakarta — the hotel's day, not the server's. */
export function todayJakarta(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

/**
 * How many rooms of each type exist. Counting is a separate read from the
 * availability check so "3 dari 5 kamar" can be said — "3 tersedia" alone reads
 * differently when the hotel has four rooms than when it has forty.
 */
async function totalsByType(tenantId: string): Promise<Map<string, number>> {
  const res = await serviceGet(
    `rooms?tenant_id=eq.${encodeURIComponent(tenantId)}&is_active=eq.true&select=room_type_id`,
  );
  const totals = new Map<string, number>();
  if (!res.ok) return totals;
  for (const r of (await res.json()) as Array<{ room_type_id: string }>) {
    totals.set(r.room_type_id, (totals.get(r.room_type_id) ?? 0) + 1);
  }
  return totals;
}

/**
 * Resolve a free-text type hint ("reguler", "yang deluxe") to a room type.
 *
 * Matched on whole words rather than substrings for the same reason the flow
 * matcher is: Indonesian room-type names are short and collide easily.
 */
export function matchRoomType(types: RoomTypeLite[], hint: string): RoomTypeLite | null {
  const h = (hint ?? "").toLowerCase().trim();
  if (!h) return null;

  // Boundaries are "not a letter or digit", not spaces: a guest writes
  // "…di reguler?" and "deluxe, ada?", where the type name is flanked by
  // punctuation. Requiring spaces missed every one of those.
  let best: RoomTypeLite | null = null;
  for (const t of types) {
    const name = t.name.toLowerCase().trim();
    if (!name) continue;
    if (h === name) return t;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const bounded = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, "u");
    if (bounded.test(h)) best = best ?? t;
  }
  return best;
}

/**
 * Availability for a date range, optionally narrowed to the type the guest
 * named.
 *
 * Defaults to TONIGHT (today → tomorrow) when no dates are given, because
 * "ada kamar kosong?" with no dates means "right now" to every guest who has
 * ever asked it.
 */
export async function checkAvailability(params: {
  tenantId: string;
  checkIn?: string | null;
  checkOut?: string | null;
  /** The guest's raw message, used only to spot a room-type name in it. */
  typeHint?: string;
}): Promise<AvailabilityResult> {
  const checkIn = params.checkIn || todayJakarta();
  const checkOut = params.checkOut || addDays(checkIn, 1);
  const nights = Math.max(
    1,
    Math.round(
      (new Date(checkOut + "T00:00:00Z").getTime() - new Date(checkIn + "T00:00:00Z").getTime()) /
        86_400_000,
    ),
  );

  const [allTypes, totals] = await Promise.all([
    listRoomTypes(params.tenantId),
    totalsByType(params.tenantId),
  ]);

  const named = params.typeHint ? matchRoomType(allTypes, params.typeHint) : null;
  const types = named ? [named] : allTypes;

  const rows: TypeAvailability[] = [];
  for (const t of types) {
    // Only the COUNT of the returned rows is kept. The room rows themselves —
    // which would let a caller name specific doors — stop here.
    const free = await getAvailableRoomsSrv(params.tenantId, checkIn, checkOut, t.id)
      .then((r) => r.length)
      .catch(() => 0);
    rows.push({
      id: t.id,
      name: t.name,
      baseRate: t.base_rate,
      maxOccupancy: t.max_occupancy ?? null,
      free,
      total: totals.get(t.id) ?? 0,
    });
  }

  return { checkIn, checkOut, nights, types: rows, narrowed: Boolean(named) };
}

// ─── Rendering ───────────────────────────────────────────────────────────────

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

/** "27 Juli" / "27–30 Juli 2026" — dates a guest reads, not ISO. */
function humanRange(checkIn: string, checkOut: string, nights: number): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", timeZone: "UTC" })
      .format(new Date(iso + "T00:00:00Z"));
  return nights === 1 ? `malam ini (${fmt(checkIn)})` : `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

/**
 * The WhatsApp reply for an availability result.
 *
 * Says how many are free and at what rate, and nothing about who holds the
 * rest. When a type is full it says so plainly rather than staying silent about
 * it — a guest who asked about "reguler" needs to hear "reguler penuh", not a
 * list that quietly omits it.
 */
export function renderAvailability(brand: string, a: AvailabilityResult): string {
  const when = humanRange(a.checkIn, a.checkOut, a.nights);

  if (a.types.length === 0) {
    return `Mohon maaf, saat ini belum ada tipe kamar yang dapat dipesan di *${brand}*.`;
  }

  const anyFree = a.types.some((t) => t.free > 0);
  const lines = a.types.map((t) => {
    const head = `*${t.name}* — ${idr(t.baseRate)}/malam`;
    if (t.free === 0) return `${head}\n    _penuh untuk tanggal ini_`;
    const cap = t.maxOccupancy ? `  ·  maks. ${t.maxOccupancy} tamu` : "";
    return `${head}\n    ✅ *${t.free}* kamar tersedia${t.total ? ` dari ${t.total}` : ""}${cap}`;
  });

  const header = a.narrowed
    ? `Ketersediaan untuk ${when}:`
    : `Ketersediaan kamar di *${brand}* untuk ${when}:`;

  const footer = anyFree
    ? "\nIngin kami pesankan? Kirim *nama, tanggal menginap, jumlah tamu, dan tipe kamar* dalam satu pesan ya."
    : "\nMohon maaf, semua kamar penuh untuk tanggal tersebut. Silakan sebutkan tanggal lain, kami cek kembali.";

  return `${header}\n\n${lines.join("\n\n")}\n${footer}`;
}
