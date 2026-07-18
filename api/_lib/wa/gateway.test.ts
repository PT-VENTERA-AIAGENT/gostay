// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { createSession, getSessionQr, getSessionStatus, deleteSession } from "./gateway";

const INT_KEY = "int_test_abc123";
const SLUG = "hotel-mawar";
const QR_DATA_URL = "data:image/png;base64,QRPAYLOAD==";

/** A per-request handler each test installs to steer the mock gateway. */
type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { path: string; auth: string | undefined; body: unknown },
) => void | Promise<void>;

interface MockState {
  requests: Array<{ method: string; path: string; auth: string | undefined; body: unknown }>;
  handler: Handler;
}

let server: Server;
let state: MockState;
let base: string;

function readBody(req: IncomingMessage): Promise<string> {
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
    const ctx = {
      path: url.pathname,
      auth: req.headers.authorization,
      body: raw ? JSON.parse(raw) : undefined,
    };
    state.requests.push({ method: req.method ?? "", ...ctx });
    await state.handler(req, res, ctx);
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** Default handler: 200 with an empty JSON object. Tests override as needed. */
const okJson: Handler = (_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end("{}");
};

beforeEach(() => {
  state = { requests: [], handler: okJson };
  process.env.WA_VENTERA_BASE_URL = base;
  process.env.WA_VENTERA_INT_KEY = INT_KEY;
});

describe("createSession", () => {
  it("POSTs {id,label} with the Bearer auth header and returns ok on 2xx", async () => {
    state.handler = (_req, res) => {
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: SLUG }));
    };

    const r = await createSession(SLUG, "Hotel Mawar");

    expect(r).toEqual({ ok: true });
    expect(state.requests).toHaveLength(1);
    const sent = state.requests[0];
    expect(sent.method).toBe("POST");
    expect(sent.path).toBe("/api/sessions");
    expect(sent.auth).toBe(`Bearer ${INT_KEY}`);
    expect(sent.body).toEqual({ id: SLUG, label: "Hotel Mawar" });
  });

  it("maps a non-2xx answer to create_failed_<status>", async () => {
    state.handler = (_req, res) => {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "already_exists" }));
    };

    const r = await createSession(SLUG);

    expect(r).toEqual({ ok: false, error: "create_failed_409" });
    expect(state.requests).toHaveLength(1);
  });

  it("returns gateway_not_configured and makes no HTTP call when env is missing", async () => {
    delete process.env.WA_VENTERA_BASE_URL;
    delete process.env.WA_VENTERA_INT_KEY;

    const r = await createSession(SLUG, "Hotel Mawar");

    expect(r).toEqual({ ok: false, error: "gateway_not_configured" });
    expect(state.requests).toHaveLength(0);
  });
});

describe("getSessionQr", () => {
  it("reads the QR off the SSE stream and then closes it", async () => {
    state.handler = (_req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // One SSE frame carrying the QR as a data: image URL.
      res.write(`event: qr\ndata: ${QR_DATA_URL}\n\n`);
      // Keep the socket open; the helper must abort it itself once it has the QR.
    };

    const r = await getSessionQr(SLUG);

    expect(r.qr).toBe(QR_DATA_URL);
    expect(r.status).toBe("qr");
    expect(r.error).toBeUndefined();

    const sent = state.requests[0];
    expect(sent.method).toBe("GET");
    expect(sent.path).toBe(`/api/sessions/${SLUG}/qr`);
    expect(sent.auth).toBe(`Bearer ${INT_KEY}`);
  });

  it("detects a bare data: line (no explicit event type) as the QR", async () => {
    state.handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${QR_DATA_URL}\n\n`);
    };

    const r = await getSessionQr(SLUG);

    expect(r.qr).toBe(QR_DATA_URL);
  });

  it("returns not_configured without touching the network when env is missing", async () => {
    delete process.env.WA_VENTERA_BASE_URL;
    delete process.env.WA_VENTERA_INT_KEY;

    const r = await getSessionQr(SLUG);

    expect(r).toEqual({ status: "not_configured", error: "gateway_not_configured" });
    expect(state.requests).toHaveLength(0);
  });
});

describe("getSessionStatus", () => {
  it('maps status "connected" to connected:true', async () => {
    state.handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: SLUG, status: "connected" }));
    };

    const r = await getSessionStatus(SLUG);

    expect(r).toEqual({ status: "connected", connected: true });
    const sent = state.requests[0];
    expect(sent.method).toBe("GET");
    expect(sent.path).toBe(`/api/sessions/${SLUG}`);
    expect(sent.auth).toBe(`Bearer ${INT_KEY}`);
  });

  it('maps a disconnected status to connected:false', async () => {
    state.handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "disconnected" }));
    };

    const r = await getSessionStatus(SLUG);

    expect(r).toEqual({ status: "disconnected", connected: false });
  });

  it("returns gateway_not_configured and makes no HTTP call when env is missing", async () => {
    delete process.env.WA_VENTERA_BASE_URL;
    delete process.env.WA_VENTERA_INT_KEY;

    const r = await getSessionStatus(SLUG);

    expect(r).toEqual({ status: "not_configured", connected: false, error: "gateway_not_configured" });
    expect(state.requests).toHaveLength(0);
  });
});

describe("deleteSession", () => {
  it("DELETEs the session and returns ok on 2xx", async () => {
    state.handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    };

    const r = await deleteSession(SLUG);

    expect(r).toEqual({ ok: true });
    const sent = state.requests[0];
    expect(sent.method).toBe("DELETE");
    expect(sent.path).toBe(`/api/sessions/${SLUG}`);
    expect(sent.auth).toBe(`Bearer ${INT_KEY}`);
  });

  it("maps a non-2xx answer to delete_failed_<status>", async () => {
    state.handler = (_req, res) => {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
    };

    const r = await deleteSession(SLUG);

    expect(r).toEqual({ ok: false, error: "delete_failed_404" });
  });

  it("returns gateway_not_configured and makes no HTTP call when env is missing", async () => {
    delete process.env.WA_VENTERA_BASE_URL;
    delete process.env.WA_VENTERA_INT_KEY;

    const r = await deleteSession(SLUG);

    expect(r).toEqual({ ok: false, error: "gateway_not_configured" });
    expect(state.requests).toHaveLength(0);
  });
});
