// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const { client } = vi.hoisted(() => ({ client: { serviceInsert: vi.fn() } }));
vi.mock("./client", () => client);

import { recordIncident, isUnroutableTarget } from "./incidents";

beforeEach(() => {
  vi.clearAllMocks();
  client.serviceInsert.mockResolvedValue({ ok: true, status: 201 });
});

describe("isUnroutableTarget", () => {
  it("recognises a LID as impossible to deliver to", () => {
    expect(isUnroutableTarget("181248240648388@lid")).toBe(true);
    expect(isUnroutableTarget("181248240648388@LID")).toBe(true);
  });

  it("treats a real phone JID as routable", () => {
    expect(isUnroutableTarget("6285641504066@s.whatsapp.net")).toBe(false);
    expect(isUnroutableTarget("")).toBe(false);
    expect(isUnroutableTarget(null)).toBe(false);
  });
});

describe("recordIncident", () => {
  const base = {
    tenantId: "tn-1",
    kind: "delivery" as const,
    customerId: "cust-1",
    threadId: "th-1",
    targetJid: "6285641504066@s.whatsapp.net",
    sessionId: "lor-kali",
    reason: "send_failed_502",
    message: "Halo! Ada yang bisa kami bantu?",
  };

  it("stores the hotel, the guest, the kind and the reason", async () => {
    await recordIncident(base);
    const [table, row] = client.serviceInsert.mock.calls[0];
    expect(table).toBe("wa_incidents");
    expect(row).toMatchObject({
      tenant_id: "tn-1",
      kind: "delivery",
      customer_id: "cust-1",
      thread_id: "th-1",
      target_jid: "6285641504066@s.whatsapp.net",
      reason: "send_failed_502",
    });
  });

  it("names the real cause when the address is a LID", async () => {
    // "send_failed_500" tells nobody that the number is unreachable by design.
    await recordIncident({ ...base, targetJid: "181248240648388@lid", reason: "send_failed_500" });
    expect(client.serviceInsert.mock.calls[0][1].reason).toBe("unroutable_lid:send_failed_500");
  });

  it("records a conversation failure with the guest's own message", async () => {
    await recordIncident({
      ...base, kind: "conversation", reason: "exception:boom", message: "menu",
    });
    expect(client.serviceInsert.mock.calls[0][1]).toMatchObject({
      kind: "conversation",
      reason: "exception:boom",
      message_preview: "menu",
    });
  });

  it("keeps a preview of what the guest never received", async () => {
    await recordIncident(base);
    expect(client.serviceInsert.mock.calls[0][1].message_preview).toBe("Halo! Ada yang bisa kami bantu?");
  });

  it("truncates a long message rather than risking a rejected insert", async () => {
    await recordIncident({ ...base, message: "x".repeat(500) });
    expect(client.serviceInsert.mock.calls[0][1].message_preview).toHaveLength(280);
  });

  it("records the incident even before a guest row exists", async () => {
    await recordIncident({ ...base, customerId: undefined, threadId: undefined });
    expect(client.serviceInsert.mock.calls[0][1]).toMatchObject({ customer_id: null, thread_id: null });
  });

  it("never throws — logging a problem must not become one", async () => {
    client.serviceInsert.mockRejectedValue(new Error("db down"));
    await expect(recordIncident(base)).resolves.toBeUndefined();
  });

  it("survives a non-2xx insert", async () => {
    client.serviceInsert.mockResolvedValue({ ok: false, status: 500 });
    await expect(recordIncident(base)).resolves.toBeUndefined();
  });
});
