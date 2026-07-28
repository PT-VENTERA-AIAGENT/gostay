// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const { client, send, takeover } = vi.hoisted(() => ({
  client: { serviceGet: vi.fn() },
  send: { sendText: vi.fn() },
  takeover: { pauseBot: vi.fn() },
}));
vi.mock("./client", () => client);
vi.mock("./send", () => send);
vi.mock("./takeover", () => takeover);

import { deliverStaffReply } from "./staff-reply";

const THREAD = {
  id: "th-1", tenant_id: "tenant-x", customer_id: "cust-1", customers: { phone: "628111000001" },
};

/** Route each PostgREST read to the right canned answer. */
function routes(over: Partial<Record<"thread" | "identity" | "session", unknown[] | null>> = {}) {
  const thread = over.thread === undefined ? [THREAD] : over.thread;
  const identity = over.identity === undefined ? [{ phone_jid: "628111000001@s.whatsapp.net" }] : over.identity;
  const session = over.session === undefined ? [{ session_id: "lor-kali" }] : over.session;

  client.serviceGet.mockImplementation(async (q: string) => {
    const pick =
      q.startsWith("chat_threads") ? thread :
      q.startsWith("wa_guest_identities") ? identity :
      q.startsWith("wa_hotel_sessions") ? session : [];
    if (pick === null) return { ok: false, status: 500 } as Response;
    return { ok: true, json: async () => pick } as unknown as Response;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  routes();
  send.sendText.mockResolvedValue({ ok: true });
  takeover.pauseBot.mockResolvedValue(undefined);
});

describe("deliverStaffReply", () => {
  it("sends the message to the guest's WhatsApp", async () => {
    // The bug this closes: the console only inserted a row, so staff replies
    // looked delivered and never reached the guest.
    const r = await deliverStaffReply({ threadId: "th-1", text: "Baik kak, kami cek dulu ya." });

    expect(r.ok).toBe(true);
    expect(send.sendText).toHaveBeenCalledWith(
      "lor-kali", "628111000001@s.whatsapp.net", "Baik kak, kami cek dulu ya.",
    );
  });

  it("takes the conversation off the bot", async () => {
    // A human typing IS the handoff — expecting staff to flip a separate switch
    // first is expecting them to remember something we can infer.
    await deliverStaffReply({ threadId: "th-1", text: "halo" });
    expect(takeover.pauseBot).toHaveBeenCalledWith("th-1");
  });

  it("can send without taking over, when asked", async () => {
    await deliverStaffReply({ threadId: "th-1", text: "halo", takeover: false });
    expect(takeover.pauseBot).not.toHaveBeenCalled();
  });

  it("prefers the LID the guest actually messaged from over their phone", async () => {
    // WhatsApp addresses some chats by LID, which is not a phone number.
    // Replying to the phone instead silently goes nowhere.
    routes({ identity: [{ phone_jid: "181248240648388@lid" }] });

    await deliverStaffReply({ threadId: "th-1", text: "halo" });

    expect(send.sendText).toHaveBeenCalledWith("lor-kali", "181248240648388@lid", "halo");
  });
});

describe("deliverStaffReply — reports rather than throws", () => {
  it("refuses an empty message", async () => {
    expect(await deliverStaffReply({ threadId: "th-1", text: "   " }))
      .toEqual({ ok: false, error: "empty_message" });
  });

  it("says so when the guest has never used WhatsApp", async () => {
    // An ordinary state for a portal-only guest, not an error worth alarming
    // staff about.
    routes({ identity: [] });
    const r = await deliverStaffReply({ threadId: "th-1", text: "halo" });
    expect(r).toEqual({ ok: false, error: "guest_not_on_whatsapp" });
    expect(send.sendText).not.toHaveBeenCalled();
  });

  it("says so when the hotel has no active WhatsApp session", async () => {
    routes({ session: [] });
    expect((await deliverStaffReply({ threadId: "th-1", text: "halo" })).error)
      .toBe("guest_not_on_whatsapp");
  });

  it("reports a gateway failure without pausing the bot", async () => {
    send.sendText.mockResolvedValue({ ok: false, error: "gateway_down" });

    const r = await deliverStaffReply({ threadId: "th-1", text: "halo" });

    expect(r.ok).toBe(false);
    expect(r.error).toBe("gateway_down");
    // Nothing was delivered, so the bot should keep answering.
    expect(takeover.pauseBot).not.toHaveBeenCalled();
  });

  it("reports a missing or unreadable thread", async () => {
    routes({ thread: [] });
    expect((await deliverStaffReply({ threadId: "gone", text: "halo" })).error).toBe("thread_not_found");

    routes({ thread: null });
    expect((await deliverStaffReply({ threadId: "th-1", text: "halo" })).error).toContain("thread_lookup_");
  });

  it("reports a thread with no guest attached", async () => {
    routes({ thread: [{ ...THREAD, customer_id: null }] });
    expect((await deliverStaffReply({ threadId: "th-1", text: "halo" })).error).toBe("thread_has_no_guest");
  });

  it("never throws", async () => {
    client.serviceGet.mockRejectedValue(new Error("ECONNRESET"));
    const r = await deliverStaffReply({ threadId: "th-1", text: "halo" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("exception");
  });
});
