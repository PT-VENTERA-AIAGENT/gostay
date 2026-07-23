// The WhatsApp booking conversation (plan: whatsapp-ai-booking, Fase 5).
//
// This is the orchestrator the webhook route (api/wa/inbound.ts) calls once per
// inbound guest message, after the tenant has been resolved from the sessionId.
// It ties together the Fase 4/5 leaf modules — AI intent extraction, pending
// state, room/availability lookup, guest provisioning, booking insert, outbound
// reply — into a small state machine:
//
//   guest text ─▶ [confirm pending?] ──YA──▶ provision + book ─▶ reply ref
//                                    ──BATAL─▶ clear ─▶ reply cancelled
//              ─▶ extract intent (merging slots already collected)
//                   ├─ not "book"        ─▶ greet / ask for booking details
//                   ├─ slots incomplete  ─▶ save "collecting" ─▶ ask what's missing
//                   └─ slots complete    ─▶ price it ─▶ save "confirm_booking"
//                                            ─▶ reply summary + "YA/BATAL"
//
// Every branch answers the guest via sendText and then returns; the route stays
// a thin shell. Provisioning is deferred to the "YA" step and FAILS CLOSED: if
// the guest cannot be provisioned, no booking is written.

import { extractBookingIntent, detectRoomServiceIntent, type BookingSlots } from "./ai";
import { getPending, setPending, clearPending } from "./pending";
import {
  getInhouseStay,
  listMenuProducts,
  createWaRoomServiceOrder,
  type MenuProduct,
  type OrderLine,
} from "./roomservice";
import {
  findRoomType,
  listRoomTypes,
  getAvailableRoomsSrv,
  computeTotal,
  createWaBooking,
  getTenantName,
  getTenantSlug,
  setCustomerName,
} from "./booking";
import {
  resolveOrProvisionGuest,
  WaRateLimitError,
} from "./guest";
import { sendText } from "./send";
import { getOrCreateBotProfile, getOrCreateThread, logMessage } from "./crm";

export interface GuestMessage {
  tenantId: string;
  sessionId: string;
  phoneJid: string;
  text: string;
  displayName?: string;
}

// Affirmatives / negatives a guest is likely to type. Matched case-insensitively
// against the whole trimmed message so "ya", "Iya", "OK" all confirm.
const YES = new Set(["ya", "iya", "y", "ok", "oke", "okay", "setuju", "lanjut"]);
const NO = new Set(["batal", "cancel", "no", "tidak", "gak", "engga", "nggak"]);

/**
 * The guest-portal link for a hotel — e.g. https://app.gostay.id/portal?hotel=slug.
 * The `?hotel=slug` is what lets one deployment show the RIGHT hotel to a guest
 * who has only ever met it over WhatsApp (src/lib/tenant.ts reads it at runtime).
 * Base URL from APP_PUBLIC_URL, defaulting to the production app domain.
 */
function portalLink(slug: string): string {
  const base = (process.env.APP_PUBLIC_URL ?? "https://app.gostay.id").replace(/\/$/, "");
  return `${base}/portal?hotel=${encodeURIComponent(slug)}`;
}

function formatIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

/** Slots gathered so far, whichever pending kind carries them. */
function knownFromPending(
  pending: { kind: string; payload: Record<string, unknown> } | null,
): Partial<BookingSlots> | undefined {
  if (!pending) return undefined;
  const p = pending.payload;
  if (pending.kind === "collecting") {
    return {
      check_in: (p.check_in as string) ?? null,
      check_out: (p.check_out as string) ?? null,
      guests: (p.guests as number) ?? null,
      room_type_hint: (p.room_type_hint as string) ?? null,
      guest_name: (p.guest_name as string) ?? null,
    };
  }
  if (pending.kind === "confirm_booking") {
    return {
      check_in: (p.checkIn as string) ?? null,
      check_out: (p.checkOut as string) ?? null,
      guests: (p.guests as number) ?? null,
      room_type_hint: (p.roomTypeName as string) ?? null,
      guest_name: (p.guestName as string) ?? null,
    };
  }
  return undefined;
}

/**
 * Handle one inbound guest message end-to-end. Never throws to the caller: any
 * unexpected failure is caught, logged, and answered with a soft apology so the
 * webhook can always 200 the gateway.
 */
export async function handleGuestMessage(msg: GuestMessage): Promise<void> {
  const { tenantId, sessionId, phoneJid, text, displayName } = msg;
  // Before we have a thread, replies go out unlogged (e.g. provisioning failed).
  const rawReply = (body: string) => sendText(sessionId, phoneJid, body);

  try {
    const trimmed = (text ?? "").trim();

    // Provision the guest on FIRST contact — this gives a profile + customer, so
    // they appear in CRM Tamu and the conversation can be surfaced in Messages.
    // Idempotent: only a number's first message actually hits Ventera.
    let guest: { profileId: string; customerId: string };
    try {
      guest = await resolveOrProvisionGuest(phoneJid, tenantId, displayName);
    } catch (e) {
      if (e instanceof WaRateLimitError) {
        await rawReply("Terlalu banyak pesan dari nomor ini. Mohon coba lagi beberapa saat lagi.");
        return;
      }
      console.error("[wa/converse] provision:", (e as Error).message);
      await rawReply("Mohon maaf, kami sedang kesulitan memproses permintaan Anda. Silakan coba lagi beberapa saat lagi.");
      return;
    }

    // Wire the conversation into the native Messages UI: one thread per guest,
    // the inbound message logged as the guest, replies logged as the bot.
    const [botId, threadId, hotelName] = await Promise.all([
      getOrCreateBotProfile(tenantId),
      getOrCreateThread(tenantId, guest.customerId),
      getTenantName(tenantId),
    ]);
    // The guest is chatting the hotel's OWN WhatsApp, so the bot speaks AS the
    // hotel. Fall back to a neutral phrase when the name can't be read.
    const brand = hotelName ?? "hotel kami";
    await logMessage(tenantId, threadId, guest.profileId, trimmed, true); // inbound
    const reply = async (body: string) => {
      await logMessage(tenantId, threadId, botId, body, false); // outbound
      return sendText(sessionId, phoneJid, body);
    };

    const word = trimmed.toLowerCase();
    const pending = await getPending(tenantId, phoneJid);

    // ── 1. Awaiting a YES/NO on a priced quote ──────────────────────────────
    if (pending?.kind === "confirm_booking") {
      if (YES.has(word)) {
        await confirmBooking(msg, pending.payload, reply, guest, brand);
        return;
      }
      if (NO.has(word)) {
        await clearPending(tenantId, phoneJid);
        await reply("Baik, pemesanan dibatalkan. Ada lagi yang dapat kami bantu?");
        return;
      }
      // Anything else: the guest is changing their mind (new dates/room). Fall
      // through and re-extract, carrying the quote's slots as context.
    }

    // ── 1b. Room-service: awaiting a YES/NO on a totalled order ──────────────
    if (pending?.kind === "confirm_room_service") {
      if (YES.has(word)) {
        await confirmRoomService(msg, pending.payload, reply, guest);
        return;
      }
      if (NO.has(word)) {
        await clearPending(tenantId, phoneJid);
        await reply("Baik, pesanan room service dibatalkan. Ada lagi yang dapat kami bantu?");
        return;
      }
      // Neither: the guest is editing the order — re-parse against the same menu.
      await collectRoomService(msg, pending.payload, trimmed, reply);
      return;
    }

    // ── 1c. Room-service: guest is picking items off the menu ────────────────
    if (pending?.kind === "rs_collecting") {
      if (NO.has(word)) {
        await clearPending(tenantId, phoneJid);
        await reply("Baik, pesanan room service dibatalkan. Ada lagi yang dapat kami bantu?");
        return;
      }
      await collectRoomService(msg, pending.payload, trimmed, reply);
      return;
    }

    // ── 1d. Fresh room-service request (only when nothing else is pending) ───
    if (!pending && detectRoomServiceIntent(trimmed)) {
      await startRoomService(msg, reply, guest, brand);
      return;
    }

    // ── 2. Understand the message ───────────────────────────────────────────
    const intent = await extractBookingIntent(trimmed, knownFromPending(pending));

    // If the guest is mid-collection, a short answer ("23", "deluxe") is filling
    // a slot we asked for — stay in the booking flow even when the model reads it
    // as small talk. Only greet when there's NO booking in progress.
    const collecting = pending?.kind === "collecting";
    if (intent.intent !== "book" && !collecting) {
      const types = await listRoomTypes(tenantId);
      const header = `*${brand}*\n_Asisten Reservasi Kamar_`;
      const divider = "──────────────────";
      let body: string;
      if (types.length) {
        const menu = types
          .map(
            (t) =>
              `*${t.name}*\n` +
              `    ${formatIDR(t.base_rate)} / malam` +
              (t.max_occupancy ? `  ·  maks. ${t.max_occupancy} tamu` : ""),
          )
          .join("\n\n");
        body =
          `${header}\n${divider}\n` +
          "Halo! Selamat datang. Berikut pilihan kamar & tarif per malam kami:\n\n" +
          `${menu}\n${divider}\n`;
      } else {
        body = `${header}\n${divider}\nHalo! Saya siap membantu pemesanan kamar Anda.\n\n`;
      }
      body +=
        "Agar dapat langsung kami periksa ketersediaan & harga, mohon kirim " +
        "*dalam satu pesan*:\n" +
        "1. Nama pemesan\n" +
        "2. Tanggal check-in\n" +
        "3. Tanggal check-out\n" +
        "4. Jumlah tamu\n" +
        "5. Tipe kamar\n\n" +
        "_Contoh: a/n Budi, 25–27 Juli, 2 orang, Deluxe_";
      await reply(body);
      return;
    }

    // ── 3. Collect everything still missing — in ONE question ───────────────
    // Resolve the room TYPE up-front so it's gathered together with the dates
    // and guest count instead of in a separate follow-up. This keeps the chat
    // short: the guest can answer every remaining field in a single message.
    const roomType = intent.room_type_hint
      ? await findRoomType(tenantId, intent.room_type_hint)
      : null;

    const missing: string[] = [];
    if (!intent.guest_name) missing.push("Nama pemesan");
    if (!intent.check_in) missing.push("Tanggal check-in");
    if (!intent.check_out) missing.push("Tanggal check-out");
    if (!intent.guests) missing.push("Jumlah tamu");
    // A named-but-unknown type (or a room NUMBER like "101") leaves roomType null
    // → we treat the type as still missing and show the real menu below.
    const needType = !roomType;
    if (needType) missing.push("Tipe kamar");

    if (missing.length > 0) {
      await setPending(tenantId, phoneJid, "collecting", {
        check_in: intent.check_in,
        check_out: intent.check_out,
        guests: intent.guests,
        room_type_hint: roomType?.name ?? null,
        guest_name: intent.guest_name,
      });

      let body =
        "Baik. Mohon lengkapi data berikut (boleh sekaligus dalam satu pesan):\n" +
        missing.map((m) => `• ${m}`).join("\n");

      // When the type is what's missing, show the real menu with prices so the
      // guest can pick it inside the same reply.
      if (needType) {
        const types = await listRoomTypes(tenantId);
        if (types.length === 0) {
          await reply(
            "Mohon maaf, saat ini belum ada tipe kamar yang dapat dipesan. Silakan hubungi kami secara langsung.",
          );
          return;
        }
        const menu = types.map((t) => `   • *${t.name}* — ${formatIDR(t.base_rate)}/malam`).join("\n");
        body += `\n\nPilihan tipe kamar:\n${menu}`;
      }

      body += "\n\nContoh: a/n Budi, 25–27 Juli, 2 orang, Deluxe";
      await reply(body);
      return;
    }

    // ── 4. Price it against real availability (all fields present) ──────────
    const checkIn = intent.check_in as string;
    const checkOut = intent.check_out as string;
    const guests = intent.guests as number;
    const guestName = intent.guest_name as string;
    if (!roomType) return; // unreachable: a missing type is collected in step 3

    // Dates are real calendar days by now (isoOrNull rejects "34 Juli"), but the
    // range can still be backwards ("27-25 Juli") — never quote a negative stay.
    // ISO strings compare correctly with <=.
    if (checkOut <= checkIn) {
      await setPending(tenantId, phoneJid, "collecting", {
        check_in: null,
        check_out: null,
        guests,
        room_type_hint: roomType.name,
        guest_name: guestName,
      });
      await reply(
        `Tanggal check-out (${checkOut}) harus setelah tanggal check-in (${checkIn}). ` +
          "Mohon kirim ulang tanggalnya.",
      );
      return;
    }

    // Occupancy guard: one room can't hold more guests than its capacity. Steer
    // the guest to a type that fits (or to reduce the party) instead of quoting
    // an over-capacity room.
    if (roomType.max_occupancy && guests > roomType.max_occupancy) {
      const types = await listRoomTypes(tenantId);
      const fits = types.filter((t) => (t.max_occupancy ?? 0) >= guests);
      await setPending(tenantId, phoneJid, "collecting", {
        check_in: checkIn,
        check_out: checkOut,
        guests,
        room_type_hint: null,
        guest_name: guestName,
      });
      if (fits.length > 0) {
        const menu = fits
          .map((t) => `   • *${t.name}* — ${formatIDR(t.base_rate)}/malam (maks ${t.max_occupancy} tamu)`)
          .join("\n");
        await reply(
          `${roomType.name} berkapasitas maksimal ${roomType.max_occupancy} tamu, sedangkan pesanan Anda untuk ${guests} tamu. ` +
            `Berikut tipe yang muat untuk ${guests} tamu:\n${menu}\n\nSilakan pilih salah satu, atau sesuaikan jumlah tamu.`,
        );
      } else {
        await reply(
          `Mohon maaf, untuk ${guests} tamu belum ada satu tipe kamar yang memadai ` +
            "(kemungkinan memerlukan beberapa kamar). Silakan hubungi kami secara langsung.",
        );
      }
      return;
    }

    const rooms = await getAvailableRoomsSrv(tenantId, checkIn, checkOut, roomType.id);
    if (rooms.length === 0) {
      await reply(
        `Mohon maaf, ${roomType.name} sedang penuh untuk ${checkIn} s/d ${checkOut}. ` +
          "Apakah Anda ingin mencoba tanggal lain?",
      );
      return;
    }

    const { nights, total } = computeTotal(roomType.base_rate, checkIn, checkOut);

    await setPending(tenantId, phoneJid, "confirm_booking", {
      roomTypeId: roomType.id,
      roomTypeName: roomType.name,
      checkIn,
      checkOut,
      guests,
      guestName,
      nights,
      total,
    });

    await reply(
      "*Ringkasan Pemesanan*\n" +
        `Atas nama: ${guestName}\n` +
        `Kamar: ${roomType.name}\n` +
        `Check-in: ${checkIn}\n` +
        `Check-out: ${checkOut} (${nights} malam)\n` +
        `Tamu: ${guests} orang\n` +
        `Total: ${formatIDR(total)}\n\n` +
        "Balas *YA* untuk konfirmasi, atau *BATAL* untuk membatalkan.",
    );
  } catch (err) {
    console.error("[wa/converse] error:", (err as Error).message);
    await rawReply("Mohon maaf, terjadi kendala. Silakan coba beberapa saat lagi.").catch(() => {});
  }
}

/**
 * The "YA" path: provision the guest (fail-closed), re-check availability at
 * commit time, insert the booking, and hand back its reference.
 */
async function confirmBooking(
  msg: GuestMessage,
  payload: Record<string, unknown>,
  reply: (body: string) => Promise<unknown>,
  guest: { profileId: string; customerId: string },
  brand: string,
): Promise<void> {
  const { tenantId, phoneJid } = msg;

  const roomTypeId = payload.roomTypeId as string;
  const checkIn = payload.checkIn as string;
  const checkOut = payload.checkOut as string;
  const guests = payload.guests as number;
  const total = payload.total as number;
  const guestName = (payload.guestName as string) ?? "";

  // Guest is already provisioned (at the top of handleGuestMessage), so we hold
  // { profileId, customerId } and go straight to committing the booking.

  // Re-check availability at commit — the room may have gone while we waited.
  const rooms = await getAvailableRoomsSrv(tenantId, checkIn, checkOut, roomTypeId);
  if (rooms.length === 0) {
    await clearPending(tenantId, phoneJid);
    await reply("Mohon maaf, kamar baru saja terisi untuk tanggal tersebut. Apakah Anda ingin mencoba tanggal lain?");
    return;
  }

  // Record who the reservation is under (the name the guest gave), so CRM and the
  // folio show it instead of the WhatsApp push-name. Best-effort — never block the
  // booking on this.
  if (guestName) await setCustomerName(guest.customerId, guestName).catch(() => {});

  const booking = await createWaBooking({
    tenantId,
    customerId: guest.customerId,
    roomId: rooms[0].id,
    checkIn,
    checkOut,
    guests,
    total,
    createdBy: guest.profileId,
  });

  await clearPending(tenantId, phoneJid);

  // A link to THIS hotel's guest portal, so the guest can track the booking,
  // chat, and order from the web — carrying ?hotel=slug so the portal knows
  // which hotel they came from. Best-effort: never block the confirmation on it.
  const slug = await getTenantSlug(tenantId).catch(() => null);
  const portal = slug
    ? `\n\nPantau & kelola pesanan Anda di portal tamu:\n${portalLink(slug)}`
    : "";

  const ref = booking.reference ? ` *${booking.reference}*` : "";
  await reply(
    `Terima kasih! Pesanan Anda${ref} sudah kami terima.\n\n` +
      "Status: *menunggu konfirmasi pembayaran*. Kami akan menginformasikan " +
      `langkah pembayaran melalui chat ini sebentar lagi. Sampai jumpa di *${brand}*!` +
      portal,
  );
}

// ─── Room service ──────────────────────────────────────────────────────────────
// The server-side twin of the guest portal's room-service order (usePortalOrder →
// guestRequestService.createRoomServiceOrder): an in-house guest picks off the
// hotel's POS menu, confirms, and the order lands as a guest_request for staff and
// is billed to the room folio. Only guests currently staying (checked_in) qualify.

/**
 * Open the room-service flow: refuse a guest who isn't in-house, otherwise show
 * the menu and park an "rs_collecting" pending carrying the menu snapshot (so the
 * numbering the guest replies to stays stable).
 */
async function startRoomService(
  msg: GuestMessage,
  reply: (body: string) => Promise<unknown>,
  guest: { profileId: string; customerId: string },
  brand: string,
): Promise<void> {
  const { tenantId, phoneJid } = msg;

  const stay = await getInhouseStay(tenantId, guest.customerId);
  if (!stay) {
    await reply(
      "Mohon maaf, layanan room service hanya tersedia untuk tamu yang sedang menginap (sudah check-in). " +
        "Bila Anda ingin melakukan pemesanan kamar, silakan sebutkan tanggal menginap, jumlah tamu, dan tipe kamar yang diinginkan.",
    );
    return;
  }

  const menu = await listMenuProducts(tenantId);
  if (menu.length === 0) {
    await reply(
      "Mohon maaf, menu room service belum tersedia saat ini. Silakan hubungi kami secara langsung.",
    );
    return;
  }

  await setPending(tenantId, phoneJid, "rs_collecting", {
    bookingId: stay.bookingId,
    roomId: stay.roomId,
    roomNumber: stay.roomNumber,
    menu,
  });
  await reply(roomServiceMenuText(brand, menu));
}

/**
 * Parse the guest's menu picks against the payload's menu snapshot. Nothing
 * recognised → re-ask; otherwise total the order and park a "confirm_room_service"
 * pending awaiting the "YA". Used both while collecting and when the guest edits
 * an order they were about to confirm.
 */
async function collectRoomService(
  msg: GuestMessage,
  payload: Record<string, unknown>,
  text: string,
  reply: (body: string) => Promise<unknown>,
): Promise<void> {
  const { tenantId, phoneJid } = msg;
  const menu = Array.isArray(payload.menu) ? (payload.menu as MenuProduct[]) : [];
  if (menu.length === 0) {
    // Snapshot lost (e.g. the pending expired mid-flow) — restart cleanly.
    await clearPending(tenantId, phoneJid);
    await reply(
      'Mohon maaf, sesi pemesanan telah berakhir. Silakan kirim ulang "room service" untuk memesan kembali.',
    );
    return;
  }

  const items = parseOrderSelection(text, menu);
  if (items.length === 0) {
    await reply(
      "Mohon maaf, kami belum mengenali pilihan Anda. Silakan balas dengan nomor menu, " +
        "misalnya *1x2, 3* (2 porsi no.1 dan 1 porsi no.3).",
    );
    return;
  }

  const total = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const count = items.reduce((s, it) => s + it.quantity, 0);
  await setPending(tenantId, phoneJid, "confirm_room_service", {
    bookingId: payload.bookingId,
    roomId: payload.roomId,
    roomNumber: payload.roomNumber,
    menu,
    items,
    total,
    count,
  });
  await reply(roomServiceSummaryText(payload.roomNumber as string | null, items, total));
}

/**
 * The room-service "YA" path: re-verify the guest is still in-house (fail-closed),
 * write the order as a guest_request (mirroring the portal), clear the pending, and
 * confirm the folio charge.
 */
async function confirmRoomService(
  msg: GuestMessage,
  payload: Record<string, unknown>,
  reply: (body: string) => Promise<unknown>,
  guest: { profileId: string; customerId: string },
): Promise<void> {
  const { tenantId, phoneJid } = msg;

  const items = (payload.items as OrderLine[] | undefined) ?? [];
  if (items.length === 0) {
    await clearPending(tenantId, phoneJid);
    await reply(
      'Mohon maaf, pesanan Anda tidak ditemukan. Silakan mulai kembali dengan mengirim "room service".',
    );
    return;
  }

  // Re-verify at commit — the stay may have checked out since the quote. Never
  // write an order without an active stay to bill it to.
  const stay = await getInhouseStay(tenantId, guest.customerId);
  if (!stay) {
    await clearPending(tenantId, phoneJid);
    await reply(
      "Mohon maaf, kami tidak menemukan status menginap aktif untuk pesanan ini. Silakan hubungi front desk.",
    );
    return;
  }

  await createWaRoomServiceOrder({
    tenantId,
    customerId: guest.customerId,
    bookingId: stay.bookingId,
    roomId: stay.roomId,
    items,
    createdBy: guest.profileId,
  });

  await clearPending(tenantId, phoneJid);

  const total = items.reduce((s, it) => s + it.price * it.quantity, 0);
  await reply(
    "Terima kasih! Pesanan room service Anda sudah kami terima dan akan segera diproses. " +
      `Total ${formatIDR(total)} akan ditambahkan ke tagihan kamar (folio) Anda.`,
  );
}

/** The numbered menu message an in-house guest replies to with their picks. */
function roomServiceMenuText(brand: string, menu: MenuProduct[]): string {
  const header = `*${brand}*\n_Menu Room Service_`;
  const divider = "──────────────────";
  const list = menu.map((p, i) => `${i + 1}. *${p.name}* — ${formatIDR(p.price)}`).join("\n");
  return (
    `${header}\n${divider}\n` +
    "Silakan pilih menu dengan membalas nomornya (boleh beberapa sekaligus):\n\n" +
    `${list}\n${divider}\n` +
    "Format: *nomor* x *jumlah*.\n" +
    "_Contoh: 1x2, 3 — artinya 2 porsi no.1 dan 1 porsi no.3._"
  );
}

/** The order summary + YA/BATAL prompt shown before the order is written. */
function roomServiceSummaryText(
  roomNumber: string | null,
  items: OrderLine[],
  total: number,
): string {
  const lines = items
    .map((it) => `${it.quantity}× ${it.name} — ${formatIDR(it.price * it.quantity)}`)
    .join("\n");
  const room = roomNumber ? `Kamar: ${roomNumber}\n` : "";
  return (
    "*Ringkasan Pesanan Room Service*\n" +
    room +
    `${lines}\n` +
    `Total: ${formatIDR(total)}\n\n` +
    "Pesanan akan ditagihkan ke folio kamar Anda.\n" +
    "Balas *YA* untuk konfirmasi, atau *BATAL* untuk membatalkan."
  );
}

/**
 * Resolve a guest's free-text picks against the numbered menu into order lines.
 *
 * Accepts, per comma/newline/"dan"-separated segment:
 *   - "3x2" / "3 * 2"  → menu #3, quantity 2
 *   - "3"              → menu #3, quantity 1
 *   - a product name (substring), optionally with a quantity digit ("kopi 2")
 * Out-of-range numbers and unrecognised text are ignored; repeats of the same
 * item accumulate. Returns [] when nothing matched, so the caller can re-ask.
 */
function parseOrderSelection(text: string, menu: MenuProduct[]): OrderLine[] {
  const acc = new Map<string, OrderLine>();
  const add = (item: MenuProduct, qty: number) => {
    const q = qty > 0 ? Math.trunc(qty) : 1;
    const existing = acc.get(item.id);
    if (existing) existing.quantity += q;
    else acc.set(item.id, { ...item, quantity: q });
  };

  for (const raw of text.split(/[,\n;+]+|\bdan\b/i)) {
    const seg = raw.trim();
    if (!seg) continue;

    // "3x2" / "3 * 2" / "3×2" → item #3, quantity 2.
    let m = seg.match(/^(\d{1,3})\s*(?:x|\*|×)\s*(\d{1,3})$/i);
    if (m) {
      const item = menu[parseInt(m[1], 10) - 1];
      if (item) add(item, parseInt(m[2], 10));
      continue;
    }
    // Bare "3" → item #3, quantity 1.
    m = seg.match(/^(\d{1,3})$/);
    if (m) {
      const item = menu[parseInt(m[1], 10) - 1];
      if (item) add(item, 1);
      continue;
    }
    // Name-based: a menu item whose name appears in the segment, with an optional
    // quantity digit anywhere in it ("nasi goreng 2", "2 kopi").
    const lower = seg.toLowerCase();
    const item = menu.find((p) => lower.includes(p.name.toLowerCase()));
    if (item) {
      const qm = lower.match(/(\d{1,3})/);
      add(item, qm ? parseInt(qm[1], 10) : 1);
    }
  }

  return [...acc.values()];
}
