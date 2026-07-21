// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { requirePlatformAdmin } from "./platform-auth";
import { mintSupabaseToken } from "../identity";

const JWT_SECRET = "test-jwt-secret-at-least-32-chars-long!!";
const PROFILE_ID = "886313e1-3b8a-5372-9b90-0c9aee199e5d";

/** Stands in for Supabase's PostgREST. */
interface MockState {
  profileRows: Array<{ id: string; role?: string; is_active?: boolean }>;
  status: number;
  getRequests: Array<{ path: string; auth: string | undefined }>;
}

let server: Server;
let state: MockState;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (url.pathname === "/rest/v1/profiles" && req.method === "GET") {
      state.getRequests.push({
        path: url.pathname + url.search,
        auth: req.headers.authorization,
      });
      res.writeHead(state.status, { "Content-Type": "application/json" });
      // A non-2xx status returns an error body, mirroring PostgREST.
      res.end(JSON.stringify(state.status < 300 ? state.profileRows : { message: "boom" }));
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
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = { profileRows: [], status: 200, getRequests: [] };
  // Restore env each case, since some cases mutate it to force a failure.
  process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
});

/** Mints a valid Supabase HS256 token for the given profile id. */
function validToken(sub: string = PROFILE_ID): string {
  const now = Math.floor(Date.now() / 1000);
  return mintSupabaseToken({ profileId: sub, issuedAt: now, expiresAt: now + 3600 })!;
}

const header = (token: string) => `Bearer ${token}`;

describe("requirePlatformAdmin", () => {
  it("denies with 401 missing_token when the header is absent", async () => {
    const r = await requirePlatformAdmin(undefined);
    expect(r).toEqual({ ok: false, status: 401, error: "missing_token" });
    // Never reaches the database.
    expect(state.getRequests).toHaveLength(0);
  });

  it("denies with 401 missing_token when the header is not a bearer token", async () => {
    const r = await requirePlatformAdmin("Basic abc123");
    expect(r).toEqual({ ok: false, status: 401, error: "missing_token" });
    expect(state.getRequests).toHaveLength(0);
  });

  it("denies with 401 invalid_token for a signature that does not verify", async () => {
    const bad = validToken().replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    const r = await requirePlatformAdmin(header(bad));
    expect(r).toEqual({ ok: false, status: 401, error: "invalid_token" });
    // A bad token never hits PostgREST.
    expect(state.getRequests).toHaveLength(0);
  });

  it("denies with 401 invalid_token for a malformed token", async () => {
    const r = await requirePlatformAdmin(header("not.a.jwt"));
    expect(r).toEqual({ ok: false, status: 401, error: "invalid_token" });
  });

  it("denies with 403 not_platform_admin for a valid token whose role is staff", async () => {
    state.profileRows = [{ id: PROFILE_ID, role: "staff", is_active: true }];
    const r = await requirePlatformAdmin(header(validToken()));
    expect(r).toEqual({ ok: false, status: 403, error: "not_platform_admin" });
    // The lookup used the token's sub.
    expect(state.getRequests[0].path).toContain(`id=eq.${PROFILE_ID}`);
    expect(state.getRequests[0].path).toContain("select=role,is_active");
  });

  it("denies with 403 not_platform_admin for an admin that is deactivated", async () => {
    state.profileRows = [{ id: PROFILE_ID, role: "admin", is_active: false }];
    const r = await requirePlatformAdmin(header(validToken()));
    expect(r).toEqual({ ok: false, status: 403, error: "not_platform_admin" });
  });

  it("denies with 403 not_authorized when no profile row matches", async () => {
    state.profileRows = [];
    const r = await requirePlatformAdmin(header(validToken()));
    expect(r).toEqual({ ok: false, status: 403, error: "not_authorized" });
  });

  it("denies with 403 not_authorized when PostgREST errors", async () => {
    state.status = 500;
    const r = await requirePlatformAdmin(header(validToken()));
    expect(r).toEqual({ ok: false, status: 403, error: "not_authorized" });
  });

  it("denies with 403 not_authorized when the database is unreachable", async () => {
    const saved = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "http://127.0.0.1:1"; // nothing listening
    try {
      const r = await requirePlatformAdmin(header(validToken()));
      expect(r).toEqual({ ok: false, status: 403, error: "not_authorized" });
    } finally {
      process.env.SUPABASE_URL = saved;
    }
  });

  it("denies with 401 invalid_token when no JWT secret is configured", async () => {
    const saved = process.env.SUPABASE_JWT_SECRET;
    // Mint before removing the secret, so only verification lacks it.
    const token = validToken();
    delete process.env.SUPABASE_JWT_SECRET;
    try {
      const r = await requirePlatformAdmin(header(token));
      expect(r).toEqual({ ok: false, status: 401, error: "invalid_token" });
      expect(state.getRequests).toHaveLength(0);
    } finally {
      process.env.SUPABASE_JWT_SECRET = saved;
    }
  });

  it("allows an active admin and returns the profileId from the token sub", async () => {
    state.profileRows = [{ id: PROFILE_ID, role: "admin", is_active: true }];
    const r = await requirePlatformAdmin(header(validToken()));
    expect(r).toEqual({ ok: true, admin: { profileId: PROFILE_ID } });
    // The service-role key authenticated the lookup.
    expect(state.getRequests[0].auth).toBe("Bearer service-role-key");
  });

  it("allows an active admin whose row omits is_active (column default is true)", async () => {
    state.profileRows = [{ id: PROFILE_ID, role: "admin" }];
    const r = await requirePlatformAdmin(header(validToken()));
    expect(r).toEqual({ ok: true, admin: { profileId: PROFILE_ID } });
  });
});
