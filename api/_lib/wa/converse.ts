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

import { extractBookingIntent, type BookingSlots } from "./ai";
import { getPending, setPending, clearPending } from "./pending";
import {
  findRoomType,
  getAvailableRoomsSrv,
  computeTotal,
  createWaBooking,
} from "./booking";
import {
  resolveOrProvisionGuest,
  WaRateLimitError,
} from "./guest";
import { sendText } from "./send";

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
    };
  }
  if (pending.kind === "confirm_booking") {
    return {
      check_in: (p.checkIn as string) ?? null,
      check_out: (p.checkOut as string) ?? null,
      guests: (p.guests as number) ?? null,
      room_type_hint: (p.roomTypeName as string) ?? null,
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
  const reply = (body: string) => sendText(sessionId, phoneJid, body);

  try {
    const trimmed = (text ?? "").trim();
    const word = trimmed.toLowerCase();
    const pending = await getPending(tenantId, phoneJid);

    // ── 1. Awaiting a YES/NO on a priced quote ──────────────────────────────
    if (pending?.kind === "confirm_booking") {
      if (YES.has(word)) {
        await confirmBooking(msg, pending.payload, reply);
        return;
      }
      if (NO.has(word)) {
        await clearPending(tenantId, phoneJid);
        await reply("Baik, pemesanan dibatalkan. Ada lagi yang bisa dibantu? 😊");
        return;
      }
      // Anything else: the guest is changing their mind (new dates/room). Fall
      // through and re-extract, carrying the quote's slots as context.
    }

    // ── 2. Understand the message ───────────────────────────────────────────
    const intent = await extractBookingIntent(trimmed, knownFromPending(pending));

    if (intent.intent !== "book") {
      await reply(
        "Halo! 👋 Saya asisten reservasi hotel. Untuk memesan kamar, sebutkan " +
          "tanggal menginap, jumlah tamu, dan tipe kamar yang diinginkan ya.",
      );
      return;
    }

    // ── 3. Collect missing slots ────────────────────────────────────────────
    const missing: string[] = [];
    if (!intent.check_in) missing.push("tanggal check-in");
    if (!intent.check_out) missing.push("tanggal check-out");
    if (!intent.guests) missing.push("jumlah tamu");

    if (missing.length > 0) {
      await setPending(tenantId, phoneJid, "collecting", {
        check_in: intent.check_in,
        check_out: intent.check_out,
        guests: intent.guests,
        room_type_hint: intent.room_type_hint,
      });
      await reply(`Baik! Boleh sebutkan ${missing.join(", ")}?`);
      return;
    }

    // ── 4. Price it against real availability ───────────────────────────────
    const checkIn = intent.check_in as string;
    const checkOut = intent.check_out as string;
    const guests = intent.guests as number;

    const roomType = await findRoomType(tenantId, intent.room_type_hint);
    if (!roomType) {
      await reply(
        "Maaf, tipe kamar itu belum tersedia di hotel kami. Mau coba tipe lain " +
          "(mis. standard, deluxe, suite)?",
      );
      return;
    }

    const rooms = await getAvailableRoomsSrv(tenantId, checkIn, checkOut, roomType.id);
    if (rooms.length === 0) {
      await reply(
        `Mohon maaf, ${roomType.name} sedang penuh untuk ${checkIn} s/d ${checkOut}. ` +
          "Mau coba tanggal lain?",
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
      nights,
      total,
    });

    await reply(
      "📋 *Ringkasan Pemesanan*\n" +
        `Kamar: ${roomType.name}\n` +
        `Check-in: ${checkIn}\n` +
        `Check-out: ${checkOut} (${nights} malam)\n` +
        `Tamu: ${guests} orang\n` +
        `Total: ${formatIDR(total)}\n\n` +
        "Balas *YA* untuk konfirmasi, atau *BATAL* untuk membatalkan.",
    );
  } catch (err) {
    console.error("[wa/converse] error:", (err as Error).message);
    await reply("Maaf, terjadi kendala. Mohon coba beberapa saat lagi. 🙏").catch(() => {});
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
): Promise<void> {
  const { tenantId, phoneJid, displayName } = msg;

  const roomTypeId = payload.roomTypeId as string;
  const checkIn = payload.checkIn as string;
  const checkOut = payload.checkOut as string;
  const guests = payload.guests as number;
  const total = payload.total as number;

  // Provision the guest's identity now — the first point we actually commit.
  let guest: { profileId: string; customerId: string };
  try {
    guest = await resolveOrProvisionGuest(phoneJid, tenantId, displayName);
  } catch (e) {
    if (e instanceof WaRateLimitError) {
      await reply("Terlalu banyak permintaan dari nomor ini. Mohon coba lagi nanti ya. 🙏");
      return;
    }
    // Ventera down or a write failed — do NOT create an ownerless booking.
    console.error("[wa/converse] provision failed:", (e as Error).message);
    await reply("Maaf, kami sedang kesulitan memproses pendaftaran Anda. Coba lagi sebentar ya. 🙏");
    return;
  }

  // Re-check availability at commit — the room may have gone while we waited.
  const rooms = await getAvailableRoomsSrv(tenantId, checkIn, checkOut, roomTypeId);
  if (rooms.length === 0) {
    await clearPending(tenantId, phoneJid);
    await reply("Mohon maaf, kamar baru saja terisi untuk tanggal itu. Mau coba tanggal lain?");
    return;
  }

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

  const ref = booking.reference ? ` *${booking.reference}*` : "";
  await reply(
    `✅ Pemesanan Anda${ref} berhasil dibuat!\n\n` +
      "Status: *menunggu konfirmasi* dari hotel. Tim kami akan segera " +
      "menghubungi Anda untuk konfirmasi pembayaran. Terima kasih! 🙏",
  );
}
