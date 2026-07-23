// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  verifySecret,
  parseMessages,
  resolveTenant,
  recordInbound,
  isDirectChat,
  toEpochMs,
  shouldAutoReply,
  checkReplyRateLimit,
  checkGreetCooldown,
} from "./inbound";

const SECRET = "wa-webhook-secret-value-1234567890";

/** Stands in for Supabase PostgREST — no real DB, no real network. */
interface MockState {
  sessions: Array<{ session_id: string; tenant_id: string; is_active: boolean }>;
  seenMessageIds: Set<string>;
  inserts: Array<Record<string, unknown>>;
  /** per-key call counts for the check_wa_rate_limit RPC mock. */
  rateCounts: Map<string, number>;
}

let server: Server;
let state: MockState;

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    // ── wa_hotel_sessions (resolveTenant) ──
    if (url.pathname === "/rest/v1/wa_hotel_sessions" && req.method === "GET") {
      const sessionId = (url.searchParams.get("session_id") ?? "").replace(/^eq\./, "");
      const wantActive = (url.searchParams.get("is_active") ?? "") === "eq.true";
      const rows = state.sessions
        .filter((s) => s.session_id === sessionId && (!wantActive || s.is_active))
        .map((s) => ({ tenant_id: s.tenant_id }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rows));
      return;
    }

    // ── wa_inbound_messages (recordInbound) ──
    if (url.pathname === "/rest/v1/wa_inbound_messages" && req.method === "POST") {
      const row = JSON.parse(await readBody(req));
      const id = String(row.wa_message_id);
      if (state.seenMessageIds.has(id)) {
        // PostgREST maps the unique_violation (23505) to HTTP 409.
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: "23505", message: "duplicate key value" }));
        return;
      }
      state.seenMessageIds.add(id);
      state.inserts.push(row);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end("");
      return;
    }

    // ── check_wa_rate_limit RPC (checkReplyRateLimit) ──
    if (url.pathname === "/rest/v1/rpc/check_wa_rate_limit" && req.method === "POST") {
      const { p_phone, p_max } = JSON.parse(await readBody(req));
      const seen = state.rateCounts.get(p_phone) ?? 0;
      const allowed = seen < p_max;
      if (allowed) state.rateCounts.set(p_phone, seen + 1);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(allowed));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.WA_WEBHOOK_SECRET = SECRET;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = { sessions: [], seenMessageIds: new Set(), inserts: [], rateCounts: new Map() };
  process.env.WA_WEBHOOK_SECRET = SECRET;
  delete process.env.WA_REPLY_MAX;
  delete process.env.WA_REPLY_WINDOW;
  delete process.env.WA_GREET_COOLDOWN;
});

describe("verifySecret", () => {
  it("accepts the matching secret", () => {
    expect(verifySecret(SECRET)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(verifySecret("nope")).toBe(false);
    expect(verifySecret(`${SECRET}x`)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifySecret(undefined)).toBe(false);
    expect(verifySecret("")).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    delete process.env.WA_WEBHOOK_SECRET;
    expect(verifySecret("anything")).toBe(false);
  });
});

describe("parseMessages", () => {
  const body = {
    sessionId: "hotel-x-sess",
    receivedAt: "2026-07-18T00:00:00.000Z",
    messages: [
      {
        key: { remoteJid: "628a@s.whatsapp.net", fromMe: false, id: "MID1" },
        message: { conversation: "halo mau booking" },
      },
      {
        key: { remoteJid: "628b@s.whatsapp.net", fromMe: false, id: "MID2" },
        message: { extendedTextMessage: { text: "kamar deluxe" } },
      },
      {
        key: { remoteJid: "me@s.whatsapp.net", fromMe: true, id: "MID3" },
        message: { conversation: "balasan bot" },
      },
    ],
  };

  it("extracts text from conversation", () => {
    expect(parseMessages(body)[0]).toMatchObject({
      waMessageId: "MID1",
      phoneJid: "628a@s.whatsapp.net",
      text: "halo mau booking",
      fromMe: false,
    });
  });

  it("extracts text from extendedTextMessage", () => {
    expect(parseMessages(body)[1].text).toBe("kamar deluxe");
  });

  it("flags fromMe so the route can skip our own echo", () => {
    const parsed = parseMessages(body);
    expect(parsed[2].fromMe).toBe(true);
    // The route drops these; only the two inbound messages survive the filter.
    expect(parsed.filter((m) => !m.fromMe)).toHaveLength(2);
  });

  it("tolerates a missing/empty messages array", () => {
    expect(parseMessages({})).toEqual([]);
    expect(parseMessages(undefined)).toEqual([]);
    expect(parseMessages({ messages: [] })).toEqual([]);
  });

  it("extracts messageTimestamp (epoch seconds) as epoch millis", () => {
    const parsed = parseMessages({
      messages: [
        {
          key: { remoteJid: "628a@s.whatsapp.net", id: "MID1" },
          messageTimestamp: 1_700_000_000,
          message: { conversation: "halo" },
        },
      ],
    });
    expect(parsed[0].timestamp).toBe(1_700_000_000_000);
  });

  it("leaves timestamp undefined when the gateway omits it", () => {
    const parsed = parseMessages({
      messages: [{ key: { remoteJid: "628a@s.whatsapp.net", id: "MID1" } }],
    });
    expect(parsed[0].timestamp).toBeUndefined();
  });
});

describe("toEpochMs", () => {
  it("converts epoch seconds to millis", () => {
    expect(toEpochMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toEpochMs("1700000000")).toBe(1_700_000_000_000);
  });

  it("reads a protobuf Long's low field (seconds)", () => {
    expect(toEpochMs({ low: 1_700_000_000, high: 0 })).toBe(1_700_000_000_000);
  });

  it("passes through values already in millis", () => {
    expect(toEpochMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("returns undefined for junk", () => {
    expect(toEpochMs(undefined)).toBeUndefined();
    expect(toEpochMs(null)).toBeUndefined();
    expect(toEpochMs("")).toBeUndefined();
    expect(toEpochMs("abc")).toBeUndefined();
    expect(toEpochMs(0)).toBeUndefined();
    expect(toEpochMs({})).toBeUndefined();
  });
});

describe("shouldAutoReply (history-sync guard)", () => {
  const now = Date.parse("2026-07-23T10:00:00.000Z");
  const receivedAt = "2026-07-23T10:00:01.000Z"; // gateway forwarded ~now

  it("answers a live message (sent seconds ago)", () => {
    const ts = now - 3_000;
    expect(shouldAutoReply(ts, receivedAt, now)).toBe(true);
  });

  it("silences a backlog message replayed at link-time", () => {
    const ts = Date.parse("2026-07-22T08:00:00.000Z"); // ~26h old
    expect(shouldAutoReply(ts, receivedAt, now)).toBe(false);
  });

  it("silences anything past the age window", () => {
    const ts = now - 6 * 60 * 1000; // 6 min > 5 min default
    expect(shouldAutoReply(ts, undefined, now)).toBe(false);
  });

  it("answers just inside the age window", () => {
    const ts = now - 4 * 60 * 1000; // 4 min < 5 min default
    expect(shouldAutoReply(ts, undefined, now)).toBe(true);
  });

  it("fails open when there is no timestamp", () => {
    expect(shouldAutoReply(undefined, receivedAt, now)).toBe(true);
  });

  it("treats a future-dated (clock-skew) message as fresh", () => {
    expect(shouldAutoReply(now + 30_000, receivedAt, now)).toBe(true);
  });

  it("uses receivedAt, not our clock, as the age reference", () => {
    // Message and gateway forward are contemporaneous (both old), but OUR clock
    // is hours ahead. Ageing against receivedAt keeps it fresh; against `now`
    // it would be wrongly silenced.
    const ts = Date.parse("2026-07-23T05:00:00.000Z");
    const forwarded = "2026-07-23T05:00:02.000Z";
    expect(shouldAutoReply(ts, forwarded, now)).toBe(true);
  });
});

describe("isDirectChat", () => {
  it("accepts one-to-one guest JIDs", () => {
    expect(isDirectChat("628123456789@s.whatsapp.net")).toBe(true);
    expect(isDirectChat("628123456789@c.us")).toBe(true);
    expect(isDirectChat("123456789@lid")).toBe(true);
    // Case-insensitive on the server part.
    expect(isDirectChat("628@S.WhatsApp.Net")).toBe(true);
  });

  it("rejects groups, broadcasts and channels (the spam source)", () => {
    expect(isDirectChat("120363000000000000@g.us")).toBe(false);
    expect(isDirectChat("status@broadcast")).toBe(false);
    expect(isDirectChat("120363000000000000@newsletter")).toBe(false);
  });

  it("rejects malformed or serverless JIDs", () => {
    expect(isDirectChat("")).toBe(false);
    expect(isDirectChat("628123456789")).toBe(false);
  });
});

describe("resolveTenant", () => {
  it("returns the tenant id for a known active session", async () => {
    state.sessions = [
      { session_id: "hotel-x-sess", tenant_id: "tenant-x", is_active: true },
    ];
    expect(await resolveTenant("hotel-x-sess")).toBe("tenant-x");
  });

  it("returns null for an unknown session", async () => {
    expect(await resolveTenant("nope-sess")).toBeNull();
  });

  it("returns null for an inactive session", async () => {
    state.sessions = [
      { session_id: "hotel-y-sess", tenant_id: "tenant-y", is_active: false },
    ];
    expect(await resolveTenant("hotel-y-sess")).toBeNull();
  });

  it("returns null for an empty session id without querying", async () => {
    expect(await resolveTenant("")).toBeNull();
  });
});

describe("recordInbound", () => {
  const msg = {
    waMessageId: "MID-record",
    sessionId: "hotel-x-sess",
    phoneJid: "628a@s.whatsapp.net",
    receivedAt: "2026-07-18T00:00:00.000Z",
    raw: { any: "thing" },
  };

  it("records a first-seen message", async () => {
    expect(await recordInbound(msg)).toBe("recorded");
    expect(state.inserts[0]).toMatchObject({
      wa_message_id: "MID-record",
      session_id: "hotel-x-sess",
      phone_jid: "628a@s.whatsapp.net",
    });
  });

  it("reports a duplicate (23505 / 409) rather than throwing", async () => {
    expect(await recordInbound(msg)).toBe("recorded");
    expect(await recordInbound(msg)).toBe("duplicate");
    // The retry did not write a second row.
    expect(state.inserts).toHaveLength(1);
  });
});

describe("checkReplyRateLimit", () => {
  const jid = "628a@s.whatsapp.net";

  it("allows replies up to the cap, then throttles", async () => {
    process.env.WA_REPLY_MAX = "3";
    expect(await checkReplyRateLimit(jid)).toBe(true);
    expect(await checkReplyRateLimit(jid)).toBe(true);
    expect(await checkReplyRateLimit(jid)).toBe(true);
    expect(await checkReplyRateLimit(jid)).toBe(false); // 4th over the cap of 3
  });

  it("namespaces its counter under 'reply:' so it never shares provisioning budget", async () => {
    process.env.WA_REPLY_MAX = "3";
    await checkReplyRateLimit(jid);
    expect(state.rateCounts.has(`reply:${jid}`)).toBe(true);
    expect(state.rateCounts.has(jid)).toBe(false);
  });

  it("keeps a separate budget per number", async () => {
    process.env.WA_REPLY_MAX = "1";
    expect(await checkReplyRateLimit("628a@s.whatsapp.net")).toBe(true);
    expect(await checkReplyRateLimit("628a@s.whatsapp.net")).toBe(false);
    // A different number is unaffected.
    expect(await checkReplyRateLimit("628b@s.whatsapp.net")).toBe(true);
  });

  it("fails open when the service is unconfigured", async () => {
    const saved = process.env.SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    expect(await checkReplyRateLimit(jid)).toBe(true);
    process.env.SUPABASE_URL = saved;
  });
});

describe("checkGreetCooldown", () => {
  const jid = "628a@s.whatsapp.net";

  it("greets only once per window, then stays silent", async () => {
    expect(await checkGreetCooldown(jid)).toBe(true); // first hello
    expect(await checkGreetCooldown(jid)).toBe(false); // burst backlog → muted
    expect(await checkGreetCooldown(jid)).toBe(false);
  });

  it("keeps its own 'greet:' counter, separate from replies", async () => {
    await checkGreetCooldown(jid);
    expect(state.rateCounts.has(`greet:${jid}`)).toBe(true);
    expect(state.rateCounts.has(`reply:${jid}`)).toBe(false);
    // A reply-limit hit on the same number is unaffected by the greet cooldown.
    expect(await checkReplyRateLimit(jid)).toBe(true);
  });

  it("greets each number independently", async () => {
    expect(await checkGreetCooldown("628a@s.whatsapp.net")).toBe(true);
    expect(await checkGreetCooldown("628b@s.whatsapp.net")).toBe(true);
  });

  it("fails open when the service is unconfigured", async () => {
    const saved = process.env.SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    expect(await checkGreetCooldown(jid)).toBe(true);
    process.env.SUPABASE_URL = saved;
  });
});
