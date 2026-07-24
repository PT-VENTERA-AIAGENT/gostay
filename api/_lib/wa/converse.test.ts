// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// The conversation orchestrator wires together five leaf modules. We mock all of
// them so these tests exercise the STATE MACHINE — which branch runs, what gets
// written, what the guest is told — not the leaves (which have their own tests).

// vi.mock is hoisted above the module body, so the mock objects it returns must
// be built inside vi.hoisted() (also hoisted) rather than as plain top-level
// consts — otherwise the factories run before those consts initialise
// ("Cannot access 'ai' before initialization").
const { ai, pending, booking, guest, send, crm, roomservice, WaRateLimitError } = vi.hoisted(() => {
  // A real error class so `instanceof WaRateLimitError` works inside converse.
  class WaRateLimitError extends Error {}
  return {
    ai: { extractBookingIntent: vi.fn(), detectRoomServiceIntent: vi.fn(), detectRoomNumberQuery: vi.fn() },
    pending: { getPending: vi.fn(), setPending: vi.fn(), clearPending: vi.fn() },
    booking: {
      findRoomType: vi.fn(),
      listRoomTypes: vi.fn(),
      getAvailableRoomsSrv: vi.fn(),
      getRoomByNumberSrv: vi.fn(),
      getRoomConflictSrv: vi.fn(),
      computeTotal: vi.fn(),
      createWaBooking: vi.fn(),
      getTenantName: vi.fn(),
      getTenantSlug: vi.fn(),
      setCustomerName: vi.fn(),
    },
    guest: { resolveOrProvisionGuest: vi.fn(), WaRateLimitError },
    send: { sendText: vi.fn() },
    crm: { getOrCreateBotProfile: vi.fn(), getOrCreateThread: vi.fn(), logMessage: vi.fn() },
    roomservice: { getInhouseStay: vi.fn(), listMenuProducts: vi.fn(), createWaRoomServiceOrder: vi.fn() },
    WaRateLimitError,
  };
});

vi.mock("./ai", () => ai);
vi.mock("./pending", () => pending);
vi.mock("./booking", () => booking);
vi.mock("./guest", () => guest);
vi.mock("./send", () => send);
vi.mock("./crm", () => crm);
vi.mock("./roomservice", () => roomservice);

import { handleGuestMessage, isGreetingTrigger } from "./converse";

const BASE = { tenantId: "tenant-x", sessionId: "hotel-x-sess", phoneJid: "628111@s.whatsapp.net" };

/** The concatenated text of every reply sent this test. */
function repliesText(): string {
  return send.sendText.mock.calls.map((c) => c[2] as string).join("\n---\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  send.sendText.mockResolvedValue({ ok: true });
  pending.getPending.mockResolvedValue(null);
  pending.setPending.mockResolvedValue(undefined);
  pending.clearPending.mockResolvedValue(undefined);
  // The guest is now provisioned at the START of every message (for CRM/Messages);
  // default it to succeed, and stub the chat-logging leaves.
  guest.resolveOrProvisionGuest.mockResolvedValue({ profileId: "prof-1", customerId: "cust-1", ssoSub: "sub-1" });
  crm.getOrCreateBotProfile.mockResolvedValue("bot-1");
  crm.getOrCreateThread.mockResolvedValue("thread-1");
  crm.logMessage.mockResolvedValue(undefined);
  booking.listRoomTypes.mockResolvedValue([
    { id: "rt-1", name: "Deluxe", base_rate: 500000, max_occupancy: 2 },
    { id: "rt-2", name: "Suite", base_rate: 900000, max_occupancy: 2 },
  ]);
  booking.getTenantName.mockResolvedValue("Hotel Uji");
  booking.getTenantSlug.mockResolvedValue("hotel-uji");
  booking.setCustomerName.mockResolvedValue(undefined);
  // Room service defaults: not a room-service message, no active stay, empty menu.
  ai.detectRoomServiceIntent.mockReturnValue(false);
  // Not a specific-room-number question by default.
  ai.detectRoomNumberQuery.mockReturnValue(null);
  booking.getRoomByNumberSrv.mockResolvedValue(null);
  booking.getRoomConflictSrv.mockResolvedValue(null);
  roomservice.getInhouseStay.mockResolvedValue(null);
  roomservice.listMenuProducts.mockResolvedValue([]);
  roomservice.createWaRoomServiceOrder.mockResolvedValue({ id: "gr-1" });
});

describe("handleGuestMessage — intent routing", () => {
  it("greets and asks for details when the message is not a booking", async () => {
    ai.extractBookingIntent.mockResolvedValue({
      intent: "chat", check_in: null, check_out: null, guests: null, room_type_hint: null, confidence: 0.9,
    });

    await handleGuestMessage({ ...BASE, text: "halo" });

    expect(send.sendText).toHaveBeenCalledTimes(1);
    expect(repliesText().toLowerCase()).toContain("asisten reservasi");
    expect(repliesText()).toContain("Hotel Uji"); // branded with the hotel name
    expect(pending.setPending).not.toHaveBeenCalled();
    expect(booking.findRoomType).not.toHaveBeenCalled();
  });

  it("stays SILENT for a non-greeting, non-booking message (anti-loop)", async () => {
    ai.extractBookingIntent.mockResolvedValue({
      intent: "chat", check_in: null, check_out: null, guests: null, room_type_hint: null, confidence: 0.9,
    });

    // An echo of our own welcome (a long, non-opener message) must NOT be greeted,
    // or a number that bounces our replies back would loop forever.
    await handleGuestMessage({
      ...BASE,
      text: "*Hotel Uji* _Asisten Reservasi Kamar_ Halo! Saya siap membantu pemesanan kamar Anda.",
    });

    expect(send.sendText).not.toHaveBeenCalled();
    expect(pending.setPending).not.toHaveBeenCalled();
  });

  it("resolves a valid type up-front and asks the remaining slots in one message", async () => {
    ai.extractBookingIntent.mockResolvedValue({
      intent: "book", check_in: "2026-07-20", check_out: null, guests: null, room_type_hint: "deluxe", confidence: 0.7,
    });
    // "deluxe" is a real type — so it's kept, and only the still-missing fields
    // (check-out, guests) get asked, all at once.
    booking.findRoomType.mockResolvedValue({ id: "rt-1", name: "Deluxe", base_rate: 500000, max_occupancy: 2 });

    await handleGuestMessage({ ...BASE, text: "mau nginap 20 juli deluxe" });

    expect(pending.setPending).toHaveBeenCalledWith(
      "tenant-x", BASE.phoneJid, "collecting",
      expect.objectContaining({ check_in: "2026-07-20", room_type_hint: "Deluxe" }),
    );
    const reply = repliesText().toLowerCase();
    expect(reply).toContain("check-out");
    expect(reply).toContain("jumlah tamu");
    expect(reply).not.toContain("check-in"); // already have it
    expect(reply).not.toContain("tipe kamar"); // valid type isn't re-asked
  });

  it("asks for the type (with a priced menu) together with the missing slots", async () => {
    ai.extractBookingIntent.mockResolvedValue({
      intent: "book", check_in: "2026-07-20", check_out: null, guests: null, room_type_hint: null, confidence: 0.7,
    });
    booking.findRoomType.mockResolvedValue(null);

    await handleGuestMessage({ ...BASE, text: "mau nginap 20 juli" });

    const reply = repliesText();
    expect(reply.toLowerCase()).toContain("check-out");
    expect(reply.toLowerCase()).toContain("jumlah tamu");
    expect(reply.toLowerCase()).toContain("tipe kamar");
    // the menu is shown so the guest can pick the type in the same reply
    expect(reply).toContain("Deluxe");
    expect(reply).toContain("Suite");
  });
});

describe("handleGuestMessage — specific room-number question", () => {
  it("tells the guest a room is BOOKED for the asked window", async () => {
    ai.detectRoomNumberQuery.mockReturnValue({ roomNumber: "201", checkIn: "2026-07-25", checkOut: null });
    booking.getRoomByNumberSrv.mockResolvedValue({ id: "room-201", number: "201", typeName: "Deluxe" });
    booking.getRoomConflictSrv.mockResolvedValue({ check_in: "2026-07-24", check_out: "2026-07-27", status: "confirmed" });

    await handleGuestMessage({ ...BASE, text: "apakah kamar 201 tersedia 25 juli?" });

    const reply = repliesText().toLowerCase();
    expect(reply).toContain("201");
    expect(reply).toContain("terpesan"); // booked
    // Never leaks the occupying guest's actual dates.
    expect(reply).not.toContain("2026-07-24");
    // Handled here — never entered the booking-extraction flow.
    expect(ai.extractBookingIntent).not.toHaveBeenCalled();
    expect(pending.setPending).not.toHaveBeenCalled();
  });

  it("tells the guest a room is AVAILABLE when free", async () => {
    ai.detectRoomNumberQuery.mockReturnValue({ roomNumber: "12", checkIn: null, checkOut: null });
    booking.getRoomByNumberSrv.mockResolvedValue({ id: "room-12", number: "12", typeName: "Suite" });
    booking.getRoomConflictSrv.mockResolvedValue(null);

    await handleGuestMessage({ ...BASE, text: "kamar 12 kosong ga?" });

    const reply = repliesText().toLowerCase();
    expect(reply).toContain("12");
    expect(reply).toContain("tersedia"); // available
    expect(booking.getRoomConflictSrv).toHaveBeenCalled();
  });

  it("says not found for a room number the hotel doesn't have", async () => {
    ai.detectRoomNumberQuery.mockReturnValue({ roomNumber: "999", checkIn: null, checkOut: null });
    booking.getRoomByNumberSrv.mockResolvedValue(null);

    await handleGuestMessage({ ...BASE, text: "kamar 999 tersedia?" });

    expect(repliesText().toLowerCase()).toContain("tidak menemukan");
    expect(booking.getRoomConflictSrv).not.toHaveBeenCalled();
  });
});

describe("handleGuestMessage — quoting", () => {
  const fullIntent = {
    intent: "book", check_in: "2026-07-20", check_out: "2026-07-22", guests: 2, room_type_hint: "deluxe", guest_name: "Budi", confidence: 0.9,
  };

  it("prices an available room and parks a 'confirm_booking' pending", async () => {
    ai.extractBookingIntent.mockResolvedValue(fullIntent);
    booking.findRoomType.mockResolvedValue({ id: "rt-1", name: "Deluxe", base_rate: 500000, max_occupancy: 2 });
    booking.getAvailableRoomsSrv.mockResolvedValue([{ id: "room-1", room_type_id: "rt-1" }]);
    booking.computeTotal.mockReturnValue({ nights: 2, total: 1000000 });

    await handleGuestMessage({ ...BASE, text: "20-22 juli 2 orang deluxe" });

    expect(pending.setPending).toHaveBeenCalledWith(
      "tenant-x", BASE.phoneJid, "confirm_booking",
      expect.objectContaining({ roomTypeId: "rt-1", checkIn: "2026-07-20", checkOut: "2026-07-22", guests: 2, total: 1000000, nights: 2 }),
    );
    const reply = repliesText();
    expect(reply).toContain("Ringkasan");
    expect(reply).toContain("Deluxe");
    expect(reply).toContain("Atas nama"); // booking is shown under the guest's name
    expect(reply).toContain("Budi");
    expect(reply.toUpperCase()).toContain("YA");
    expect(booking.createWaBooking).not.toHaveBeenCalled(); // not yet — waiting for YA
  });

  it("shows the room-type menu when the hint matches no type", async () => {
    ai.extractBookingIntent.mockResolvedValue(fullIntent);
    booking.findRoomType.mockResolvedValue(null); // hint "deluxe" matched nothing here

    await handleGuestMessage({ ...BASE, text: "20-22 juli 2 orang kamar 101" });

    // Keeps the dates/guests (collecting) and lists the real types with prices.
    expect(pending.setPending).toHaveBeenCalledWith(
      "tenant-x", BASE.phoneJid, "collecting",
      expect.objectContaining({ check_in: "2026-07-20", check_out: "2026-07-22", guests: 2, room_type_hint: null }),
    );
    const reply = repliesText();
    expect(reply.toLowerCase()).toContain("tipe kamar");
    expect(reply).toContain("Deluxe");
    expect(reply).toContain("Suite");
    expect(booking.createWaBooking).not.toHaveBeenCalled();
  });

  it("rejects a backwards date range and asks for the dates again", async () => {
    ai.extractBookingIntent.mockResolvedValue({
      intent: "book", check_in: "2026-07-27", check_out: "2026-07-25", guests: 2, room_type_hint: "deluxe", guest_name: "Budi", confidence: 0.9,
    });
    booking.findRoomType.mockResolvedValue({ id: "rt-1", name: "Deluxe", base_rate: 500000, max_occupancy: 2 });

    await handleGuestMessage({ ...BASE, text: "27-25 juli 2 orang deluxe a/n Budi" });

    expect(booking.computeTotal).not.toHaveBeenCalled();
    expect(booking.getAvailableRoomsSrv).not.toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("harus setelah tanggal check-in");
    expect(pending.setPending).toHaveBeenCalledWith(
      "tenant-x", BASE.phoneJid, "collecting",
      expect.objectContaining({ check_in: null, check_out: null }),
    );
  });

  it("steers to a fitting type when the party exceeds the room capacity", async () => {
    ai.extractBookingIntent.mockResolvedValue({
      intent: "book", check_in: "2026-07-20", check_out: "2026-07-22", guests: 5, room_type_hint: "deluxe", guest_name: "Budi", confidence: 0.9,
    });
    booking.findRoomType.mockResolvedValue({ id: "rt-1", name: "Deluxe", base_rate: 500000, max_occupancy: 2 });
    booking.listRoomTypes.mockResolvedValue([
      { id: "rt-1", name: "Deluxe", base_rate: 500000, max_occupancy: 2 },
      { id: "rt-3", name: "Family", base_rate: 1200000, max_occupancy: 6 },
    ]);

    await handleGuestMessage({ ...BASE, text: "20-22 juli 5 orang deluxe a/n Budi" });

    expect(booking.computeTotal).not.toHaveBeenCalled();
    const reply = repliesText();
    expect(reply.toLowerCase()).toContain("maksimal 2 tamu");
    expect(reply).toContain("Family"); // the type that actually fits 5
  });

  it("apologises when the type exists but no room is free", async () => {
    ai.extractBookingIntent.mockResolvedValue(fullIntent);
    booking.findRoomType.mockResolvedValue({ id: "rt-1", name: "Deluxe", base_rate: 500000, max_occupancy: 2 });
    booking.getAvailableRoomsSrv.mockResolvedValue([]);

    await handleGuestMessage({ ...BASE, text: "20-22 juli 2 orang deluxe" });

    expect(pending.setPending).not.toHaveBeenCalled();
    expect(booking.computeTotal).not.toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("penuh");
  });
});

describe("handleGuestMessage — confirmation", () => {
  const confirmPending = {
    kind: "confirm_booking",
    payload: { roomTypeId: "rt-1", roomTypeName: "Deluxe", checkIn: "2026-07-20", checkOut: "2026-07-22", guests: 2, guestName: "Budi", nights: 2, total: 1000000 },
  };

  it("YA provisions the guest, books, clears pending, and replies with the reference", async () => {
    pending.getPending.mockResolvedValue(confirmPending);
    guest.resolveOrProvisionGuest.mockResolvedValue({ profileId: "prof-1", customerId: "cust-1", ssoSub: "sub-1" });
    booking.getAvailableRoomsSrv.mockResolvedValue([{ id: "room-1", room_type_id: "rt-1" }]);
    booking.createWaBooking.mockResolvedValue({ id: "bk-1", reference: "GS-0001" });

    await handleGuestMessage({ ...BASE, text: "YA", displayName: "Budi" });

    expect(guest.resolveOrProvisionGuest).toHaveBeenCalledWith(BASE.phoneJid, "tenant-x", "Budi");
    expect(booking.createWaBooking).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-x", customerId: "cust-1", roomId: "room-1", createdBy: "prof-1", total: 1000000 }),
    );
    expect(pending.clearPending).toHaveBeenCalled();
    expect(repliesText()).toContain("GS-0001");
    // records the booking name, scoped to the hotel that owns the conversation
    expect(booking.setCustomerName).toHaveBeenCalledWith("tenant-x", "cust-1", "Budi");
  });

  it("BATAL clears the pending and books nothing", async () => {
    pending.getPending.mockResolvedValue(confirmPending);

    await handleGuestMessage({ ...BASE, text: "batal" });

    expect(pending.clearPending).toHaveBeenCalled();
    // Guest is provisioned on contact now (for CRM/Messages), but NO booking is made.
    expect(booking.createWaBooking).not.toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("dibatalkan");
  });

  it("YA but the room sold out since the quote → apologises, no booking", async () => {
    pending.getPending.mockResolvedValue(confirmPending);
    guest.resolveOrProvisionGuest.mockResolvedValue({ profileId: "prof-1", customerId: "cust-1", ssoSub: "sub-1" });
    booking.getAvailableRoomsSrv.mockResolvedValue([]);

    await handleGuestMessage({ ...BASE, text: "ya" });

    expect(booking.createWaBooking).not.toHaveBeenCalled();
    expect(pending.clearPending).toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("terisi");
  });

  it("YA but provisioning is rate-limited → apologises, no booking", async () => {
    pending.getPending.mockResolvedValue(confirmPending);
    guest.resolveOrProvisionGuest.mockRejectedValue(new WaRateLimitError("wa_rate_limited"));

    await handleGuestMessage({ ...BASE, text: "ya" });

    expect(booking.createWaBooking).not.toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("terlalu banyak");
  });

  it("YA but Ventera provisioning fails → apologises, books nothing", async () => {
    pending.getPending.mockResolvedValue(confirmPending);
    guest.resolveOrProvisionGuest.mockRejectedValue(new Error("ventera_503"));

    await handleGuestMessage({ ...BASE, text: "ya" });

    expect(booking.createWaBooking).not.toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("kesulitan memproses");
  });
});

describe("handleGuestMessage — room service", () => {
  const MENU = [
    { id: "p-1", name: "Kopi", category: "fnb", price: 25000 },
    { id: "p-2", name: "Nasi Goreng", category: "fnb", price: 45000 },
  ];

  it("shows the menu to an in-house guest and parks an rs_collecting pending", async () => {
    ai.detectRoomServiceIntent.mockReturnValue(true);
    roomservice.getInhouseStay.mockResolvedValue({ bookingId: "bk-1", roomId: "room-1", roomNumber: "101" });
    roomservice.listMenuProducts.mockResolvedValue(MENU);

    await handleGuestMessage({ ...BASE, text: "mau pesan makanan" });

    expect(pending.setPending).toHaveBeenCalledWith(
      "tenant-x", BASE.phoneJid, "rs_collecting",
      expect.objectContaining({ bookingId: "bk-1", roomId: "room-1", roomNumber: "101", menu: MENU }),
    );
    const reply = repliesText();
    expect(reply.toLowerCase()).toContain("menu room service");
    expect(reply).toContain("Kopi");
    expect(reply).toContain("Nasi Goreng");
    // The intent must never reach the booking extractor.
    expect(ai.extractBookingIntent).not.toHaveBeenCalled();
    expect(roomservice.createWaRoomServiceOrder).not.toHaveBeenCalled();
  });

  it("refuses room service when the guest has no active (checked_in) stay", async () => {
    ai.detectRoomServiceIntent.mockReturnValue(true);
    roomservice.getInhouseStay.mockResolvedValue(null);

    await handleGuestMessage({ ...BASE, text: "lapar, mau room service" });

    const reply = repliesText().toLowerCase();
    expect(reply).toContain("hanya tersedia untuk tamu yang sedang menginap");
    // Offers to help with a booking instead.
    expect(reply).toContain("pemesanan kamar");
    expect(pending.setPending).not.toHaveBeenCalled();
    expect(roomservice.listMenuProducts).not.toHaveBeenCalled();
  });

  it("parses picks from the menu snapshot and parks a confirm_room_service quote", async () => {
    pending.getPending.mockResolvedValue({
      kind: "rs_collecting",
      payload: { bookingId: "bk-1", roomId: "room-1", roomNumber: "101", menu: MENU },
    });

    await handleGuestMessage({ ...BASE, text: "1x2, 2" });

    expect(pending.setPending).toHaveBeenCalledWith(
      "tenant-x", BASE.phoneJid, "confirm_room_service",
      expect.objectContaining({
        bookingId: "bk-1",
        total: 25000 * 2 + 45000, // two Kopi + one Nasi Goreng
        items: expect.arrayContaining([
          expect.objectContaining({ id: "p-1", quantity: 2 }),
          expect.objectContaining({ id: "p-2", quantity: 1 }),
        ]),
      }),
    );
    const reply = repliesText();
    expect(reply).toContain("Ringkasan Pesanan Room Service");
    expect(reply.toUpperCase()).toContain("YA");
    expect(roomservice.createWaRoomServiceOrder).not.toHaveBeenCalled();
  });

  it("re-asks when the guest's picks match nothing on the menu", async () => {
    pending.getPending.mockResolvedValue({
      kind: "rs_collecting",
      payload: { bookingId: "bk-1", roomId: "room-1", roomNumber: "101", menu: MENU },
    });

    await handleGuestMessage({ ...BASE, text: "99" }); // out of range

    expect(pending.setPending).not.toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("belum mengenali pilihan");
  });

  it("YA writes the order (mirroring the portal) and confirms the folio charge", async () => {
    pending.getPending.mockResolvedValue({
      kind: "confirm_room_service",
      payload: {
        bookingId: "bk-1", roomId: "room-1", roomNumber: "101", menu: MENU,
        items: [{ id: "p-1", name: "Kopi", category: "fnb", price: 25000, quantity: 2 }],
        total: 50000, count: 2,
      },
    });
    roomservice.getInhouseStay.mockResolvedValue({ bookingId: "bk-1", roomId: "room-1", roomNumber: "101" });

    await handleGuestMessage({ ...BASE, text: "YA" });

    expect(roomservice.createWaRoomServiceOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-x", customerId: "cust-1", bookingId: "bk-1", roomId: "room-1", createdBy: "prof-1",
        items: expect.arrayContaining([expect.objectContaining({ id: "p-1", quantity: 2 })]),
      }),
    );
    expect(pending.clearPending).toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("folio");
  });

  it("BATAL cancels the room-service order and writes nothing", async () => {
    pending.getPending.mockResolvedValue({
      kind: "confirm_room_service",
      payload: { bookingId: "bk-1", roomId: "room-1", roomNumber: "101", items: [{ id: "p-1", name: "Kopi", category: "fnb", price: 25000, quantity: 1 }], total: 25000, count: 1 },
    });

    await handleGuestMessage({ ...BASE, text: "batal" });

    expect(roomservice.createWaRoomServiceOrder).not.toHaveBeenCalled();
    expect(pending.clearPending).toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("dibatalkan");
  });

  it("YA but the stay ended since the quote → apologises, writes nothing", async () => {
    pending.getPending.mockResolvedValue({
      kind: "confirm_room_service",
      payload: { bookingId: "bk-1", roomId: "room-1", roomNumber: "101", items: [{ id: "p-1", name: "Kopi", category: "fnb", price: 25000, quantity: 1 }], total: 25000, count: 1 },
    });
    roomservice.getInhouseStay.mockResolvedValue(null); // checked out meanwhile

    await handleGuestMessage({ ...BASE, text: "ya" });

    expect(roomservice.createWaRoomServiceOrder).not.toHaveBeenCalled();
    expect(pending.clearPending).toHaveBeenCalled();
    expect(repliesText().toLowerCase()).toContain("menginap aktif");
  });

  it("never throws; a mid-flow room-service failure still answers with an apology", async () => {
    pending.getPending.mockResolvedValue({
      kind: "confirm_room_service",
      payload: { bookingId: "bk-1", roomId: "room-1", roomNumber: "101", items: [{ id: "p-1", name: "Kopi", category: "fnb", price: 25000, quantity: 1 }], total: 25000, count: 1 },
    });
    roomservice.getInhouseStay.mockResolvedValue({ bookingId: "bk-1", roomId: "room-1", roomNumber: "101" });
    roomservice.createWaRoomServiceOrder.mockRejectedValue(new Error("insert_failed"));

    await expect(handleGuestMessage({ ...BASE, text: "ya" })).resolves.toBeUndefined();
    expect(repliesText().toLowerCase()).toContain("kendala");
  });
});

describe("handleGuestMessage — resilience", () => {
  it("never throws; a mid-flow failure still answers with an apology", async () => {
    ai.extractBookingIntent.mockRejectedValue(new Error("openai_down"));

    await expect(handleGuestMessage({ ...BASE, text: "20-22 juli 2 orang" })).resolves.toBeUndefined();
    expect(repliesText().toLowerCase()).toContain("kendala");
  });
});

describe("isGreetingTrigger", () => {
  it("accepts real openers (short, greeting words)", () => {
    for (const t of ["halo", "Halo!", "hai", "hi", "hi kak", "selamat pagi", "assalamualaikum", "P", "menu"]) {
      expect(isGreetingTrigger(t)).toBe(true);
    }
  });

  it("rejects arbitrary / long messages and our own echoed reply (the loop source)", () => {
    for (const t of [
      "",
      "tolong kirim invoice kemarin ya pak terima kasih",
      "nomor rekening berapa",
      "*Hotel Uji* _Asisten Reservasi Kamar_ Halo! Saya siap membantu pemesanan kamar Anda",
    ]) {
      expect(isGreetingTrigger(t)).toBe(false);
    }
  });

  it("honors WA_GREETING_TRIGGERS override", () => {
    process.env.WA_GREETING_TRIGGERS = "ping,mulai";
    expect(isGreetingTrigger("ping")).toBe(true);
    expect(isGreetingTrigger("halo")).toBe(false); // no longer a trigger under the override
    delete process.env.WA_GREETING_TRIGGERS;
  });
});
