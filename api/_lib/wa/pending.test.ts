// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getPending, setPending, clearPending } from "./pending";

// A stand-in PostgREST. Records every request and answers from `next`.
interface Recorded { method: string; url: string; prefer: string | null; body: string; }
interface MockState { requests: Recorded[]; getRows: unknown[]; }

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
    const body = await readBody(req);
    state.requests.push({
      method: req.method ?? "",
      url: req.url ?? "",
      prefer: (req.headers["prefer"] as string) ?? null,
      body,
    });
    if (req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(state.getRows));
      return;
    }
    res.statusCode = req.method === "DELETE" ? 204 : 201;
    res.end("");
  });
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = { requests: [], getRows: [] };
});

describe("getPending", () => {
  it("returns null when there is no row", async () => {
    state.getRows = [];
    expect(await getPending("t1", "628@s.whatsapp.net")).toBeNull();
  });

  it("returns a live pending action", async () => {
    state.getRows = [
      { kind: "collecting", payload: { guests: 2 }, expires_at: new Date(Date.now() + 60_000).toISOString() },
    ];
    const p = await getPending("t1", "628@s.whatsapp.net");
    expect(p).toEqual({ kind: "collecting", payload: { guests: 2 } });
    // Scoped by both tenant and phone.
    expect(state.requests[0].url).toContain("tenant_id=eq.t1");
    expect(state.requests[0].url).toContain("phone_jid=eq.");
  });

  it("treats an expired row as absent and deletes it", async () => {
    state.getRows = [
      { kind: "confirm_booking", payload: {}, expires_at: new Date(Date.now() - 1000).toISOString() },
    ];
    expect(await getPending("t1", "628@s.whatsapp.net")).toBeNull();
    expect(state.requests.some((r) => r.method === "DELETE")).toBe(true);
  });
});

describe("setPending", () => {
  it("upserts on the (tenant, phone) conflict target with a fresh expiry", async () => {
    await setPending("t1", "628@s.whatsapp.net", "confirm_booking", { total: 1000 }, 15);
    const post = state.requests.find((r) => r.method === "POST")!;
    expect(post.url).toContain("on_conflict=tenant_id,phone_jid");
    expect(post.prefer).toContain("resolution=merge-duplicates");
    const sent = JSON.parse(post.body);
    expect(sent).toMatchObject({ tenant_id: "t1", kind: "confirm_booking", payload: { total: 1000 } });
    expect(typeof sent.expires_at).toBe("string");
  });
});

describe("clearPending", () => {
  it("issues a scoped DELETE", async () => {
    await clearPending("t1", "628@s.whatsapp.net");
    const del = state.requests.find((r) => r.method === "DELETE")!;
    expect(del.url).toContain("tenant_id=eq.t1");
    expect(del.url).toContain("phone_jid=eq.");
  });
});
