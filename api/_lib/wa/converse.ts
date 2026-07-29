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

import { extractBookingIntent, detectRoomServiceIntent, detectMenuKeyword, detectAvailabilityQuery, detectRoomNumberQuery, type BookingSlots, type RoomNumberQuery } from "./ai";
import { getPending, setPending, clearPending } from "./pending";
import {
  getInhouseStay,
  listMenuProducts,
  createWaRoomServiceOrder,
  type MenuProduct,
  type OrderLine,
} from "./roomservice";
import { paymentInstruction } from "./payment";
import { checkAvailability as queryAvailability, renderAvailability } from "./availability";
import { askConcierge } from "./concierge";
import { routeFlow } from "./flow/route";
import type { FlowActions } from "./flow/engine";
import {
  findRoomType,
  listRoomTypes,
  getAvailableRoomsSrv,
  getRoomByNumberSrv,
  getRoomConflictSrv,
  computeTotal,
  createWaBooking,
  getTenantName,
  getTenantSlug,
  setCustomerName,
  getCustomerPhone,
} from "./booking";
import {
  resolveOrProvisionGuest,
  WaRateLimitError,
} from "./guest";
import { sendText } from "./send";
import { recordIncident } from "./incidents";
import { chooseOutboundTarget } from "./address";
import { getOrCreateBotProfile, getOrCreateThread, logMessage } from "./crm";
import { checkGreetCooldown, checkFlowStartBudget } from "./inbound";
import { isBotPaused, pauseBot } from "./takeover";

export interface GuestMessage {
  tenantId: string;
  sessionId: string;
  phoneJid: string;
  /** PN alternate for outbound delivery when phoneJid is a WhatsApp LID. */
  replyJid?: string;
  text: string;
  displayName?: string;
}

// Affirmatives / negatives a guest is likely to type. Matched case-insensitively
// against the whole trimmed message so "ya", "Iya", "OK" all confirm.
const YES = new Set(["ya", "iya", "y", "ok", "oke", "okay", "setuju", "lanjut"]);
const NO = new Set(["batal", "cancel", "no", "tidak", "gak", "engga", "nggak"]);

// Words that abandon ANY pending conversation, not just a yes/no prompt.
// Narrower than NO on purpose: "tidak" is a legitimate answer to a question, so
// only unambiguous exits belong here. Matched against the whole trimmed message
// so "batalkan saja yang kemarin" — a plausible sentence — is not an exit.
const ESCAPE = new Set(["batal", "batalkan", "cancel", "stop", "keluar", "selesai", "udahan", "gak jadi", "ga jadi"]);

// Openers that a guest actually starts a chat with. The welcome greeting fires
// ONLY for these — never for every stray/unrecognised message — so the bot can't
// spam a greeting per message (a looping/echoing number, or an offline backlog).
// Overridable per deployment via WA_GREETING_TRIGGERS (comma-separated); a future
// step makes this a per-hotel setting the staff can edit.
const DEFAULT_GREETING_TRIGGERS = [
  "halo", "hallo", "helo", "hai", "hi", "hey", "hello",
  "assalamualaikum", "assalamualaikum wr wb", "permisi", "spasi",
  "pagi", "siang", "sore", "malam", "selamat",
  "info", "menu", "help", "bantuan", "tanya", "start", "mulai", "p",
];

function greetingTriggers(): string[] {
  const raw = process.env.WA_GREETING_TRIGGERS;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return DEFAULT_GREETING_TRIGGERS;
}

/**
 * True when the message reads like a chat opener (a greeting), not an arbitrary
 * sentence. We keep it tight: only short messages (≤ 4 words) whose words include
 * a trigger count — so "halo" / "selamat pagi" / "hi kak" greet, but a long
 * unrelated message (or an echo of our own reply) does not, which is what stops
 * the greeting loop.
 */
export function isGreetingTrigger(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  const words = cleaned.split(" ");
  if (words.length > 4) return false;
  const triggers = new Set(greetingTriggers());
  return words.some((w) => triggers.has(w));
}

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
  const { tenantId, sessionId, phoneJid, replyJid, text, displayName } = msg;
  // Where replies go. Starts with whatever the webhook gave us and is refined
  // once the guest is known — a hotel that has typed the guest's real number
  // into CRM rescues a conversation WhatsApp would otherwise leave unreachable.
  let target = chooseOutboundTarget({ phoneJid, replyJid });
  let outboundJid = target.jid;
  // Filled in once the guest is provisioned, so a failure recorded after that
  // point names the guest instead of just a JID.
  let failureCtx: { customerId?: string | null; threadId?: string | null } = {};
  const deliver = async (body: string) => {
    const result = await sendText(sessionId, outboundJid, body);
    // A LID cannot be delivered to, but the gateway answers 200 and drops the
    // message — so its success is not evidence of anything. Record it anyway,
    // or the failure stays invisible exactly as it did before.
    if (result.ok && target.unroutable) {
      await recordIncident({
        tenantId,
        kind: "delivery",
        customerId: failureCtx.customerId,
        threadId: failureCtx.threadId,
        targetJid: outboundJid,
        sessionId,
        reason: "gateway_reported_ok",
        message: body,
      });
    }
    if (!result.ok) {
      console.error("[wa/converse] outbound reply failed:", {
        sessionId,
        guestJid: phoneJid,
        outboundJid,
        error: result.error,
      });
      // Persist it too. A console line in a serverless log is invisible to the
      // people who need it: the hotel sees the reply sitting in its inbox and
      // has no way to know the guest never got it.
      await recordIncident({
        tenantId,
        kind: "delivery",
        customerId: failureCtx.customerId,
        threadId: failureCtx.threadId,
        targetJid: outboundJid,
        sessionId,
        reason: result.error ?? "unknown",
        message: body,
      });
    }
    return result;
  };
  // Before we have a thread, replies go out unlogged (e.g. provisioning failed).
  const rawReply = (body: string) => deliver(body);

  try {
    const trimmed = (text ?? "").trim();

    // Provision the guest on FIRST contact — this gives a profile + customer, so
    // they appear in CRM Tamu and the conversation can be surfaced in Messages.
    // Idempotent: only a number's first message actually hits Ventera.
    let guest: { profileId: string; customerId: string };
    try {
      guest = await resolveOrProvisionGuest(phoneJid, tenantId, displayName, replyJid);
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
    // From here on a delivery failure can name the guest and the conversation.
    failureCtx = { customerId: guest.customerId, threadId };

    // Now that the guest is known, see whether the hotel has recorded a real
    // number for them. For a LID guest that is the difference between a
    // conversation that works and one that silently goes nowhere.
    if (target.unroutable) {
      const phone = await getCustomerPhone(guest.customerId);
      target = chooseOutboundTarget({ phoneJid, replyJid, customerPhone: phone });
      outboundJid = target.jid;
    }
    await logMessage(tenantId, threadId, guest.profileId, trimmed, true); // inbound
    const reply = async (body: string) => {
      await logMessage(tenantId, threadId, botId, body, false); // outbound
      return deliver(body);
    };

    // ── 0a. A human owns this conversation — say nothing ────────────────────
    // Placed AFTER the inbound message is logged, so staff still see what the
    // guest wrote; it only stops the bot from answering over them. Everything
    // below is skipped, including the flows.
    if (await isBotPaused(threadId)) return;

    const word = trimmed.toLowerCase();
    const pending = await getPending(tenantId, phoneJid);

    // ── 0. The hotel's own script, if it claims this message ────────────────
    // Flows drawn in the console get first refusal. routeFlow declines — and
    // costs nothing but the check — when the hotel has drawn none, when another
    // conversation is already mid-flight, or when no keyword matches, so
    // everything below is unchanged for a hotel that never opens the builder.
    const routed = await routeFlow({
      tenantId,
      phoneJid,
      input: trimmed,
      pending,
      vars: {
        hotel_name: brand,
        guest_name: (displayName ?? "").trim(),
      },
      reply,
      actions: builtInActions(msg, reply, guest, brand),
      // Lazy: only consulted when a flow actually gates on the guest staying.
      isInhouse: async () => (await getInhouseStay(tenantId, guest.customerId)) !== null,
    });
    if (routed.handled) {
      // A handoff node fired. Until now that was only a sentence; this is what
      // makes it true — the bot stops until staff hand it back or the takeover
      // lapses.
      if (routed.handoff) {
        await clearPending(tenantId, phoneJid);
        await pauseBot(threadId);
      }
      return;
    }

    // ── 0b. Let the guest out of a conversation they no longer want ─────────
    // Without this a "collecting" row is a trap. Its TTL is refreshed on every
    // turn, so waiting never frees them, and until now nothing in the collecting
    // branch recognised "batal" — a guest who changed their mind was answered
    // with the same form forever. Reported from production, where a stale row
    // held a number for 47 minutes across a dozen messages.
    if (pending && ESCAPE.has(word)) {
      await clearPending(tenantId, phoneJid);
      await reply("Baik, dibatalkan. Ada lagi yang dapat kami bantu?");
      return;
    }

    // ── 0c. A question deserves an answer, even mid-form ────────────────────
    // "Hari ini ada kamar yang kosong?" is not a slot value, and answering it
    // with "mohon lengkapi data berikut" is how the trap above became visible.
    // The detector demands BOTH an availability cue and a room word, so a real
    // slot answer ("2 orang", "27 Juli") cannot reach this.
    //
    // The booking state is deliberately LEFT INTACT: the guest asked a question
    // in the middle of booking, and should be able to carry on afterwards.
    // Room-service ordering is excluded — its pending payload carries a menu
    // snapshot that a detour would strand.
    const midRoomService = pending?.kind === "rs_collecting" || pending?.kind === "confirm_room_service";
    if (!midRoomService && detectAvailabilityQuery(trimmed)) {
      try {
        const a = await queryAvailability({ tenantId, typeHint: trimmed });
        await reply(renderAvailability(brand, a));
        return;
      } catch (e) {
        console.error("[wa/converse] availability:", (e as Error).message);
      }
    }

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
    // "menu" is the word guests actually type, but it is ambiguous: from an
    // in-house guest it means the room-service list, from a prospective one it
    // means "what do you offer?". So it opens room service only when they are
    // genuinely checked in — otherwise startRoomService declines to handle it
    // and the message falls through to the greeting (room types + portal link),
    // which is what "menu" has always answered with for a non-guest.
    if (!pending) {
      const rsIntent = detectRoomServiceIntent(trimmed);
      const menuOnly = !rsIntent && detectMenuKeyword(trimmed);
      if (rsIntent || menuOnly) {
        const handled = await startRoomService(msg, reply, guest, brand, {
          fallThroughWhenNotInhouse: menuOnly,
        });
        if (handled) return;
      }
    }

    // ── 1e. "Is room 201 available?" — a specific room-number question ───────
    // Answered from live bookings so the guest gets the true booked/free status
    // of that exact room. Only when nothing else is mid-flow.
    if (!pending) {
      const roomQuery = detectRoomNumberQuery(trimmed);
      if (roomQuery) {
        await answerRoomNumberQuery(msg, roomQuery, reply, brand);
        return;
      }
    }

    // ── 2. Understand the message ───────────────────────────────────────────
    const intent = await extractBookingIntent(trimmed, knownFromPending(pending));

    // If the guest is mid-collection, a short answer ("23", "deluxe") is filling
    // a slot we asked for — stay in the booking flow even when the model reads it
    // as small talk. Only greet when there's NO booking in progress.
    const collecting = pending?.kind === "collecting";
    if (intent.intent !== "book" && !collecting) {
      // Not a greeting either. Before answering nothing, let the grounded
      // assistant try — this is the point where a guest asking something the
      // keyword flows never anticipated used to get silence.
      //
      // It is NOT a licence to answer everything: looksLikeQuestion() and a
      // per-number budget stand in front, and the assistant itself refuses when
      // its tools do not cover the question. See concierge.ts.
      if (!isGreetingTrigger(trimmed)) {
        if (await tryAiFallback({ tenantId, phoneJid, brand, text: trimmed, reply })) return;
        // Narrow trigger: the welcome greeting fires ONLY for an actual opener
        // ("halo", "hai", …) — never for every stray message. This is the core
        // anti-spam/anti-loop rule: a message that isn't a greeting gets no
        // reply, so an echoing/looping number can't pull an endless stream.
        return;
      }
      // And even a real greeting is answered at most once per window per number.
      if (!(await checkGreetCooldown(phoneJid))) return;

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
    // The guest gets a plain apology — they cannot act on a stack trace, and a
    // technical string would only alarm them. The detail goes to the incident
    // log instead, where staff and the platform console can see WHICH guest hit
    // it and what broke, which is the part that was missing entirely.
    await recordIncident({
      tenantId,
      kind: "conversation",
      customerId: failureCtx.customerId,
      threadId: failureCtx.threadId,
      targetJid: outboundJid,
      sessionId,
      reason: `exception:${(err as Error).message}`,
      message: (text ?? "").trim(),
    }).catch(() => {});
    await rawReply(
      "Mohon maaf, terjadi kendala pada sistem kami sehingga pesan Anda belum bisa diproses. " +
        "Tim kami sudah menerima laporannya. Silakan coba beberapa saat lagi, " +
        "atau balas *staf* untuk berbicara langsung dengan kami.",
    ).catch(() => {});
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
  if (guestName) await setCustomerName(tenantId, guest.customerId, guestName).catch(() => {});

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

  // Payment, in the same chat. Best-effort by construction: the booking is
  // already committed, so paymentInstruction never throws — it returns
  // front-desk wording when this hotel is not on online payments and a
  // "we'll follow up" line when the gateway could not be reached. Either way
  // the guest is told what they owe, which is what the old copy promised and
  // never delivered.
  const payment = await paymentInstruction({
    tenantId,
    bookingReference: booking.reference ?? null,
    total,
    brand,
  }).catch((e) => {
    console.error("[wa/converse] payment instruction failed:", (e as Error).message);
    return null;
  });

  const ref = booking.reference ? ` *${booking.reference}*` : "";
  await reply(
    `Terima kasih! Pesanan Anda${ref} sudah kami terima.\n\n` +
      (payment ? `${payment.text}\n\n` : "") +
      `Sampai jumpa di *${brand}*!` +
      portal,
  );
}

// ─── The assistant as a last resort, not as a free-for-all ───────────────────

/**
 * Whether a message is worth spending a model call on.
 *
 * Three filters, each closing a specific hole:
 *   - Too short ("ok", "👍", "y") carries no question, and answering it invites
 *     a reply to every acknowledgement a guest sends.
 *   - Too long is almost always our own reply relayed back by a third-party
 *     system. The fromMe filter cannot see those, and they contain question
 *     marks and room words, so length is what distinguishes them.
 *   - No question shape at all — a statement like "oke besok saya datang" needs
 *     no answer, and answering it is how a bot becomes tiresome.
 */
export function looksLikeQuestion(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 6 || t.length > 300) return false;

  const words = t.split(/\s+/).length;
  if (words < 2) return false;

  if (t.includes("?")) return true;
  // Indonesian question words, as whole words.
  return /(?:^|\s)(apa|apakah|adakah|ada|berapa|bisakah|bisa|boleh|kapan|dimana|di mana|gimana|bagaimana|kenapa|mengapa|siapa|minta|tolong)(?:\s|$)/i
    .test(t);
}

/**
 * Let the grounded assistant answer when nothing else did.
 *
 * Returns true when it replied. Every guard is deliberately BEFORE the model
 * call, so a message that should not be answered costs nothing:
 *   1. shape — looksLikeQuestion above
 *   2. budget — the same per-number window flows use, under its own namespace,
 *      so a loop cannot pull an unbounded number of model calls
 *   3. grounding — the assistant refuses rather than inventing (concierge.ts),
 *      and we stay silent on a refusal rather than sending "saya belum tahu" to
 *      a message that may not have been a question at all
 */
async function tryAiFallback(p: {
  tenantId: string;
  phoneJid: string;
  brand: string;
  text: string;
  reply: (body: string) => Promise<unknown>;
}): Promise<boolean> {
  if (!looksLikeQuestion(p.text)) return false;
  if (!(await checkFlowStartBudget("ai-fallback", p.phoneJid))) return false;

  const r = await askConcierge({ tenantId: p.tenantId, brand: p.brand, question: p.text });

  // Ungrounded means the model looked nothing up — it was talking from memory,
  // the key is missing, or the guardrail replaced the answer. None of those is
  // worth sending to a message we were not sure was a question.
  if (!r.grounded) return false;

  await p.reply(r.text);
  return true;
}

// ─── The capabilities a drawn flow can invoke ────────────────────────────────

/**
 * Bind the built-in hotel capabilities to this message.
 *
 * These are the ONLY things an `action` node can do. Each one wraps behaviour
 * that already exists and is tested, so a hotel drawing a canvas chooses when
 * something happens without being able to redraw how it happens — the booking
 * conversation's slot-filling, pricing and confirmation stay in one place.
 */
function builtInActions(
  msg: GuestMessage,
  reply: (body: string) => Promise<unknown>,
  guest: { profileId: string; customerId: string },
  brand: string,
): FlowActions {
  const { tenantId, phoneJid } = msg;

  return {
    /**
     * Enter the booking conversation with nothing gathered yet: park an empty
     * "collecting" row and ask for every field at once. The guest's next
     * message is then handled by step 3 of handleGuestMessage exactly as if
     * they had opened with a booking request.
     */
    async startBooking() {
      await setPending(tenantId, phoneJid, "collecting", {
        check_in: null, check_out: null, guests: null,
        room_type_hint: null, guest_name: null,
      });
      let body =
        "Baik. Agar dapat langsung kami periksa ketersediaan & harga, mohon kirim " +
        "*dalam satu pesan*:\n" +
        "1. Nama pemesan\n2. Tanggal check-in\n3. Tanggal check-out\n" +
        "4. Jumlah tamu\n5. Tipe kamar";
      const types = await listRoomTypes(tenantId).catch(() => []);
      if (types.length) {
        body += `\n\nPilihan tipe kamar:\n${types
          .map((t) => `   • *${t.name}* — ${formatIDR(t.base_rate)}/malam`)
          .join("\n")}`;
      }
      body += "\n\n_Contoh: a/n Budi, 25–27 Juli, 2 orang, Deluxe_";
      await reply(body);
    },

    /** Reuses the existing entry point, including its in-house check. */
    startRoomService() {
      return startRoomService(msg, reply, guest, brand, { fallThroughWhenNotInhouse: true });
    },

    /**
     * Answer "is anything free?" from live bookings. Counts only — see
     * availability.ts on why the room rows never reach this layer.
     */
    async checkAvailability() {
      const a = await queryAvailability({ tenantId, typeHint: msg.text ?? "" });
      await reply(renderAvailability(brand, a));
    },

    async showRoomTypes() {
      const types = await listRoomTypes(tenantId).catch(() => []);
      if (types.length === 0) {
        await reply("Mohon maaf, saat ini belum ada tipe kamar yang dapat dipesan.");
        return;
      }
      const list = types
        .map(
          (t) =>
            `*${t.name}*\n    ${formatIDR(t.base_rate)} / malam` +
            (t.max_occupancy ? `  ·  maks. ${t.max_occupancy} tamu` : ""),
        )
        .join("\n\n");
      await reply(`Pilihan kamar & tarif per malam di *${brand}*:\n\n${list}`);
    },

    /**
     * Show the POS menu WITHOUT starting an order — the read-only twin of
     * start_room_service, for a script that wants to display prices and then
     * carry on asking its own questions.
     */
    async showMenu() {
      const menu = await listMenuProducts(tenantId).catch(() => []);
      if (menu.length === 0) {
        await reply("Mohon maaf, menu belum tersedia saat ini.");
        return;
      }
      await reply(roomServiceMenuText(brand, menu));
    },

    /**
     * Answer whatever the guest asked, from real data plus the hotel's own
     * knowledge base. See concierge.ts — it refuses rather than inventing.
     */
    async askConcierge() {
      const r = await askConcierge({ tenantId, brand, question: msg.text ?? "" });
      await reply(r.text);
    },

    async sendPortalLink() {
      const slug = await getTenantSlug(tenantId).catch(() => null);
      if (!slug) return;
      await reply(`Pantau & kelola pesanan Anda di portal tamu:\n${portalLink(slug)}`);
    },
  };
}

/** Add whole days to a YYYY-MM-DD date (UTC midnight, DST-safe). */
function addDaysIso(iso: string, days: number): string {
  const t = new Date(iso + "T00:00:00Z").getTime() + days * 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Answer a "kamar 201 available?" question from live booking data.
 *
 * Uses the guest's dates when given, else checks today (a single night). Reports
 * only booked/free for that window — never the occupying guest or their dates,
 * matching the availability RPC's privacy stance. Booking itself stays by room
 * TYPE, so a free room is steered back into the normal booking flow.
 */
async function answerRoomNumberQuery(
  msg: GuestMessage,
  q: RoomNumberQuery,
  reply: (body: string) => Promise<unknown>,
  brand: string,
): Promise<void> {
  const { tenantId } = msg;

  const room = await getRoomByNumberSrv(tenantId, q.roomNumber);
  if (!room) {
    await reply(
      `Mohon maaf, kami tidak menemukan kamar nomor *${q.roomNumber}* di *${brand}*. ` +
        "Silakan sebutkan tanggal menginap, jumlah tamu, dan tipe kamar — kami bantu carikan yang tersedia.",
    );
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const checkIn = q.checkIn ?? today;
  // No explicit checkout → treat as a single night from the check-in date.
  let checkOut = q.checkOut ?? addDaysIso(checkIn, 1);
  if (!(checkOut > checkIn)) checkOut = addDaysIso(checkIn, 1);

  const forWhen = q.checkIn
    ? q.checkOut
      ? `untuk ${checkIn} s/d ${checkOut}`
      : `untuk ${checkIn}`
    : "hari ini";
  const typeLabel = room.typeName ? ` (${room.typeName})` : "";

  const conflict = await getRoomConflictSrv(tenantId, room.id, checkIn, checkOut);
  if (conflict) {
    await reply(
      `Kamar *${room.number}*${typeLabel} sedang *terpesan* ${forWhen}. ` +
        "Mau kami carikan kamar lain yang kosong, atau coba tanggal lain?",
    );
  } else {
    await reply(
      `Kamar *${room.number}*${typeLabel} *masih tersedia* ${forWhen}. ✅\n\n` +
        "Untuk memesan, kirim tanggal menginap, jumlah tamu, dan atas nama siapa — nanti kami siapkan.",
    );
  }
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
  opts: {
    /**
     * Return false instead of answering when the guest has no active stay, so
     * the caller can let the message continue down the normal path. Set for a
     * bare "menu", where a not-checked-in guest is browsing rather than failing
     * to order — see the call site in the router.
     */
    fallThroughWhenNotInhouse?: boolean;
  } = {},
): Promise<boolean> {
  const { tenantId, phoneJid } = msg;

  const stay = await getInhouseStay(tenantId, guest.customerId);
  if (!stay) {
    if (opts.fallThroughWhenNotInhouse) return false;
    await reply(
      "Mohon maaf, layanan room service hanya tersedia untuk tamu yang sedang menginap (sudah check-in). " +
        "Bila Anda ingin melakukan pemesanan kamar, silakan sebutkan tanggal menginap, jumlah tamu, dan tipe kamar yang diinginkan.",
    );
    return true;
  }

  const menu = await listMenuProducts(tenantId);
  if (menu.length === 0) {
    await reply(
      "Mohon maaf, menu room service belum tersedia saat ini. Silakan hubungi kami secara langsung.",
    );
    return true;
  }

  await setPending(tenantId, phoneJid, "rs_collecting", {
    bookingId: stay.bookingId,
    roomId: stay.roomId,
    roomNumber: stay.roomNumber,
    menu,
  });
  await reply(roomServiceMenuText(brand, menu));
  return true;
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
