// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  verifySecret,
  parseMessages,
  resolveTenant,
  recordInbound,
} from "./inbound";

const SECRET = "wa-webhook-secret-value-1234567890";

/** Stands in for Supabase PostgREST — no real DB, no real network. */
interface MockState {
  sessions: Array<{ session_id: string; tenant_id: string; is_active: boolean }>;
  seenMessageIds: Set<string>;
  inserts: Array<Record<string, unknown>>;
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
  state = { sessions: [], seenMessageIds: new Set(), inserts: [] };
  process.env.WA_WEBHOOK_SECRET = SECRET;
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
