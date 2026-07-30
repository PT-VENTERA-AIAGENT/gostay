// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const { client, staffReply, crm } = vi.hoisted(() => ({
  client: { serviceGet: vi.fn() },
  staffReply: { deliverStaffReply: vi.fn() },
  crm: {
    getOrCreateThread: vi.fn(),
    getOrCreateBotProfile: vi.fn(),
    logMessage: vi.fn(),
  },
}));
vi.mock("./client", () => client);
vi.mock("./staff-reply", () => staffReply);
vi.mock("./crm", () => crm);

import { notifyRequestStatus } from "./request-notify";

const TENANT = "tenant-1";

/** Balas GET permintaan lalu GET nama hotel, dalam urutan yang dipakai modul. */
function stubLookups(request: Record<string, unknown> | null, hotelName = "Lor Kali") {
  client.serviceGet.mockImplementation(async (q: string) => {
    if (q.startsWith("guest_requests")) {
      return { ok: true, json: async () => (request ? [request] : []) };
    }
    if (q.startsWith("tenants")) {
      return { ok: true, json: async () => [{ name: hotelName }] };
    }
    return { ok: true, json: async () => [] };
  });
}

const request = {
  id: "req-1",
  tenant_id: TENANT,
  customer_id: "cust-1",
  title: "Room service — 4 item",
  status: "done",
};

beforeEach(() => {
  vi.clearAllMocks();
  crm.getOrCreateThread.mockResolvedValue("thread-1");
  crm.getOrCreateBotProfile.mockResolvedValue("bot-1");
  crm.logMessage.mockResolvedValue(undefined);
  staffReply.deliverStaffReply.mockResolvedValue({ ok: true, jid: "628123@s.whatsapp.net" });
  stubLookups(request);
});

describe("notifyRequestStatus", () => {
  it("tells the guest their request is done, naming the hotel", async () => {
    const res = await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });

    expect(res.ok).toBe(true);
    const [sent] = staffReply.deliverStaffReply.mock.calls[0];
    expect(sent.threadId).toBe("thread-1");
    expect(sent.text).toContain("Lor Kali");
    expect(sent.text).toContain("Room service — 4 item");
  });

  it("NEVER pauses the bot — this is not a human typing", async () => {
    // deliverStaffReply defaults to takeover:true because a staff member typing
    // IS the handoff. An automated status update is not, and pausing here would
    // leave the guest's next message unanswered by anyone.
    await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });
    expect(staffReply.deliverStaffReply.mock.calls[0][0].takeover).toBe(false);
  });

  it("logs the message into the conversation, so staff see what the guest was told", async () => {
    await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });
    expect(crm.logMessage).toHaveBeenCalled();
    const args = crm.logMessage.mock.calls[0];
    expect(args[1]).toBe("thread-1");
    expect(args[4]).toBe(false); // outbound
  });

  it("says something different for in_progress and cancelled", async () => {
    stubLookups({ ...request, status: "in_progress" });
    await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });
    expect(staffReply.deliverStaffReply.mock.calls[0][0].text).toMatch(/sedang kami siapkan/i);

    vi.clearAllMocks();
    crm.getOrCreateThread.mockResolvedValue("thread-1");
    crm.getOrCreateBotProfile.mockResolvedValue("bot-1");
    staffReply.deliverStaffReply.mockResolvedValue({ ok: true });
    stubLookups({ ...request, status: "cancelled" });
    await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });
    expect(staffReply.deliverStaffReply.mock.calls[0][0].text).toMatch(/batalkan/i);
  });

  it("stays silent for 'open' — the flow already confirmed the order", async () => {
    stubLookups({ ...request, status: "open" });
    const res = await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });

    expect(res).toEqual({ ok: false, error: "status_not_notifiable" });
    expect(staffReply.deliverStaffReply).not.toHaveBeenCalled();
  });

  it("refuses a request belonging to ANOTHER hotel, however the id was obtained", async () => {
    stubLookups({ ...request, tenant_id: "tenant-lain" });
    const res = await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });

    expect(res).toEqual({ ok: false, error: "request_not_found" });
    expect(staffReply.deliverStaffReply).not.toHaveBeenCalled();
  });

  it("has nobody to tell for a walk-in request with no guest record", async () => {
    stubLookups({ ...request, customer_id: null });
    const res = await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });

    expect(res).toEqual({ ok: false, error: "request_has_no_guest" });
    expect(staffReply.deliverStaffReply).not.toHaveBeenCalled();
  });

  it("reports a delivery failure rather than claiming the guest was told", async () => {
    staffReply.deliverStaffReply.mockResolvedValue({ ok: false, error: "guest_not_on_whatsapp" });
    const res = await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });
    expect(res).toMatchObject({ ok: false, error: "guest_not_on_whatsapp" });
  });

  it("never throws — the status is already saved before this runs", async () => {
    client.serviceGet.mockRejectedValue(new Error("db down"));
    const res = await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("db down");
  });

  it("still logs the message when logging itself fails, and sends anyway", async () => {
    crm.logMessage.mockRejectedValue(new Error("log down"));
    const res = await notifyRequestStatus({ requestId: "req-1", tenantId: TENANT });
    expect(res.ok).toBe(true);
  });
});
