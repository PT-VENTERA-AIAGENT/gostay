// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { sendText } from "./send";

const INT_KEY = "int_test_abc123";
const SESSION_ID = "hotel-x-sess";

/** Records what the mock gateway saw, and lets each test steer the reply. */
interface MockState {
  requests: Array<{ method: string; path: string; auth: string | undefined; body: unknown }>;
  status: number;
  responseBody: unknown;
  retryAfter: string | undefined;
}

let server: Server;
let state: MockState;
let base: string;

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
    const raw = await readBody(req);
    state.requests.push({
      method: req.method ?? "",
      path: url.pathname,
      auth: req.headers.authorization,
      body: raw ? JSON.parse(raw) : undefined,
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (state.retryAfter !== undefined) headers["Retry-After"] = state.retryAfter;
    res.writeHead(state.status, headers);
    res.end(JSON.stringify(state.responseBody));
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = { requests: [], status: 200, responseBody: {}, retryAfter: undefined };
  process.env.WA_VENTERA_BASE_URL = base;
  process.env.WA_VENTERA_INT_KEY = INT_KEY;
});

describe("sendText", () => {
  it("posts the contract request and returns the messageId on 200", async () => {
    state.status = 200;
    state.responseBody = { ok: true, to: "628123@s.whatsapp.net", messageId: "wamid.XYZ" };

    const r = await sendText(SESSION_ID, "628123", "Halo, booking Anda pending.");

    expect(r).toEqual({ ok: true, messageId: "wamid.XYZ" });

    // Exactly one HTTP call, hitting the session-scoped send path.
    expect(state.requests).toHaveLength(1);
    const sent = state.requests[0];
    expect(sent.method).toBe("POST");
    expect(sent.path).toBe(`/api/sessions/${SESSION_ID}/send`);
    expect(sent.auth).toBe(`Bearer ${INT_KEY}`);
    expect(sent.body).toEqual({
      to: "628123",
      type: "text",
      text: "Halo, booking Anda pending.",
    });
  });

  it("maps a 409 (session not connected) to send_failed_409", async () => {
    state.status = 409;
    state.responseBody = { error: "session_not_connected" };

    const r = await sendText(SESSION_ID, "628123", "hi");

    expect(r).toEqual({ ok: false, error: "send_failed_409" });
    expect(state.requests).toHaveLength(1);
  });

  it("returns send_not_configured and makes no HTTP call when env is missing", async () => {
    delete process.env.WA_VENTERA_BASE_URL;
    delete process.env.WA_VENTERA_INT_KEY;

    const r = await sendText(SESSION_ID, "628123", "hi");

    expect(r).toEqual({ ok: false, error: "send_not_configured" });
    // The gateway must never be touched when we cannot authenticate.
    expect(state.requests).toHaveLength(0);
  });
});
