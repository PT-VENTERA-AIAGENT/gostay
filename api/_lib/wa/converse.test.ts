// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// The conversation orchestrator wires together five leaf modules. We mock all of
// them so these tests exercise the STATE MACHINE — which branch runs, what gets
// written, what the guest is told — not the leaves (which have their own tests).

// vi.mock is hoisted above the module body, so the mock objects it returns must
// be built inside vi.hoisted() (also hoisted) rather than as plain top-level
// consts — otherwise the factories run before those consts initialise
// ("Cannot access 'ai' before initialization").
const { ai, pending, booking, guest, send, crm, WaRateLimitError } = vi.hoisted(() => {
  // A real error class so `instanceof WaRateLimitError` works inside converse.
  class WaRateLimitError extends Error {}
  return {
    ai: { extractBookingIntent: vi.fn() },
    pending: { getPending: vi.fn(), setPending: vi.fn(), clearPending: vi.fn() },
    booking: {
      findRoomType: vi.fn(),
      listRoomTypes: vi.fn(),
      getAvailableRoomsSrv: vi.fn(),
      computeTotal: vi.fn(),
      createWaBooking: vi.fn(),
    },
    guest: { resolveOrProvisionGuest: vi.fn(), WaRateLimitError },
    send: { sendText: vi.fn() },
    crm: { getOrCreateBotProfile: vi.fn(), getOrCreateThread: vi.fn(), logMessage: vi.fn() },
    WaRateLimitError,
  };
});

vi.mock("./ai", () => ai);
vi.mock("./pending", () => pending);
vi.mock("./booking", () => booking);
vi.mock("./guest", () => guest);
vi.mock("./send", () => send);
vi.mock("./crm", () => crm);

import { handleGuestMessage } from "./converse";

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
});

describe("handleGuestMessage — intent routing", () => {
  it("greets and asks for details when the message is not a booking", async () => {
    ai.extractBookingIntent.mockResolvedValue({
      intent: "chat", check_in: null, check_out: null, guests: null, room_type_hint: null, confidence: 0.9,
    });

    await handleGuestMessage({ ...BASE, text: "halo" });

    expect(send.sendText).toHaveBeenCalledTimes(1);
    expect(repliesText().toLowerCase()).toContain("asisten reservasi");
    expect(pending.setPending).not.toHaveBeenCalled();
    expect(booking.findRoomType).not.toHaveBeenCalled();
  });

  it("asks for the missing slots and stores a 'collecting' pending", async () => {
    ai.extractBookingIntent.mockResolvedValue({
      intent: "book", check_in: "2026-07-20", check_out: null, guests: null, room_type_hint: "deluxe", confidence: 0.7,
    });

    await handleGuestMessage({ ...BASE, text: "mau nginap 20 juli deluxe" });

    expect(pending.setPending).toHaveBeenCalledWith(
      "tenant-x", BASE.phoneJid, "collecting",
      expect.objectContaining({ check_in: "2026-07-20", room_type_hint: "deluxe" }),
    );
    const reply = repliesText();
    expect(reply).toContain("tanggal check-out");
    expect(reply).toContain("jumlah tamu");
    expect(reply).not.toContain("tanggal check-in"); // already have it
    expect(booking.findRoomType).not.toHaveBeenCalled();
  });
});

describe("handleGuestMessage — quoting", () => {
  const fullIntent = {
    intent: "book", check_in: "2026-07-20", check_out: "2026-07-22", guests: 2, room_type_hint: "deluxe", confidence: 0.9,
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
    payload: { roomTypeId: "rt-1", roomTypeName: "Deluxe", checkIn: "2026-07-20", checkOut: "2026-07-22", guests: 2, nights: 2, total: 1000000 },
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

describe("handleGuestMessage — resilience", () => {
  it("never throws; a mid-flow failure still answers with an apology", async () => {
    ai.extractBookingIntent.mockRejectedValue(new Error("openai_down"));

    await expect(handleGuestMessage({ ...BASE, text: "20-22 juli 2 orang" })).resolves.toBeUndefined();
    expect(repliesText().toLowerCase()).toContain("kendala");
  });
});
