// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { exchangeCode } from "./exchange";
import { profileIdFor, verifySupabaseToken } from "./identity";

const JWT_SECRET = "test-jwt-secret-at-least-32-chars-long!!";
const SSO_SUB = "ventera|abc-123";
const ORIGIN = "http://localhost:8080";

function fakeIdToken(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256", typ: "JWT" })}.${b64(claims)}.fake-signature`;
}

/** Stands in for both the SSO issuer and Supabase's PostgREST. */
interface MockState {
  tokenRequests: Array<Record<string, string>>;
  profileRows: Array<{ id: string; role: string; email?: string; full_name?: string }>;
  inserts: Array<Record<string, unknown>>;
  patches: Array<Record<string, unknown>>;
  realm: string | undefined;
  tokenStatus: number;
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
    const body = await readBody(req);

    // ── SSO issuer ──
    if (url.pathname === "/oidc/token") {
      state.tokenRequests.push(Object.fromEntries(new URLSearchParams(body)));
      if (state.tokenStatus !== 200) {
        res.writeHead(state.tokenStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_grant", client_secret: "LEAKED" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id_token: fakeIdToken({
          sub: SSO_SUB, email: "staff@ventera.ai", name: "Rafli Staff", realm: state.realm,
        }),
        access_token: "sso-access-token",
        expires_in: 3600,
        token_type: "Bearer",
      }));
      return;
    }

    // ── PostgREST ──
    if (url.pathname === "/rest/v1/profiles") {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state.profileRows));
        return;
      }
      if (req.method === "POST") {
        const row = JSON.parse(body);
        state.inserts.push(row);
        state.profileRows.push(row);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify([row]));
        return;
      }
      if (req.method === "PATCH") {
        state.patches.push(JSON.parse(body));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state.profileRows));
        return;
      }
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  process.env.SSO_ISSUER = base;
  process.env.SSO_CLIENT_ID = "gostay";
  process.env.SSO_CLIENT_SECRET = "super-secret-value";
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  delete process.env.SSO_ADMIN_REALMS;
  delete process.env.SSO_STAFF_REALMS;
  delete process.env.SSO_UUID_NAMESPACE;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = {
    tokenRequests: [], profileRows: [], inserts: [], patches: [],
    realm: "ventera-employees", tokenStatus: 200,
  };
});

const call = () => exchangeCode({ code: "auth-code", code_verifier: "verifier-123", origin: ORIGIN });

describe("exchangeCode — OIDC leg", () => {
  it("sends the client secret and PKCE verifier to the issuer", async () => {
    await call();
    const sent = state.tokenRequests[0];
    expect(sent.grant_type).toBe("authorization_code");
    expect(sent.code).toBe("auth-code");
    expect(sent.code_verifier).toBe("verifier-123");
    expect(sent.client_secret).toBe("super-secret-value");
  });

  it("derives redirect_uri from the Origin rather than trusting the caller", async () => {
    await call();
    expect(state.tokenRequests[0].redirect_uri).toBe(`${ORIGIN}/auth/callback`);
  });

  it("never forwards an upstream error body, which can quote the secret back", async () => {
    state.tokenStatus = 400;
    const r = await call();
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain("LEAKED");
    expect(r.body).toEqual({ error: "token_exchange_failed" });
  });
});

describe("exchangeCode — Supabase identity bridge", () => {
  it("mints a Supabase token whose sub is the derived profile uuid", async () => {
    const r = await call();
    expect(r.status).toBe(200);

    const token = r.body.supabase_token as string;
    expect(token).toBeTruthy();

    const claims = verifySupabaseToken(token, JWT_SECRET)!;
    expect(claims).not.toBeNull();
    // This is the value auth.uid() will return inside every RLS policy.
    expect(claims.sub).toBe(profileIdFor(SSO_SUB));
    expect(claims.role).toBe("authenticated");
  });

  it("expires the Supabase token with the SSO session", async () => {
    const r = await call();
    const claims = verifySupabaseToken(r.body.supabase_token as string, JWT_SECRET)!;
    expect((claims.exp as number) - (claims.iat as number)).toBe(3600);
  });

  it("creates the profile on first login with the realm-derived role", async () => {
    const r = await call();
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      id: profileIdFor(SSO_SUB),
      sso_sub: SSO_SUB,
      email: "staff@ventera.ai",
      full_name: "Rafli Staff",
      role: "admin",
    });
    expect(r.body.role).toBe("admin");
  });

  it("gives a guest the customer role, not staff", async () => {
    state.realm = "customers";
    const r = await call();
    expect(state.inserts[0].role).toBe("customer");
    expect(r.body.role).toBe("customer");
  });

  it("treats a missing realm as a guest", async () => {
    state.realm = undefined;
    const r = await call();
    expect(state.inserts[0].role).toBe("customer");
    expect(r.body.role).toBe("customer");
  });

  it("does not overwrite a role an admin changed after first login", async () => {
    // Employee realm would seed "admin", but an admin demoted them since.
    state.profileRows = [{ id: profileIdFor(SSO_SUB), role: "staff" }];
    const r = await call();

    expect(state.inserts).toHaveLength(0);
    expect(r.body.role).toBe("staff");
    // Contact details still refresh; role is deliberately absent from the patch.
    expect(state.patches).toHaveLength(1);
    expect(state.patches[0]).not.toHaveProperty("role");
    expect(state.patches[0]).toMatchObject({ email: "staff@ventera.ai" });
  });

  it("reports the stored role, which is what RLS enforces", async () => {
    state.realm = "ventera-employees";
    state.profileRows = [{ id: profileIdFor(SSO_SUB), role: "customer" }];
    const r = await call();
    // Realm says admin; the database says customer. The database wins.
    expect(r.body.role).toBe("customer");
  });

  it("still signs the user in when Supabase is not configured", async () => {
    const url = process.env.SUPABASE_URL;
    const secret = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_JWT_SECRET;
    try {
      const r = await call();
      expect(r.status).toBe(200);
      expect(r.body.id_token).toBeTruthy();
      // No token means the client falls back to anon and reads only public data.
      expect(r.body.supabase_token).toBeNull();
    } finally {
      process.env.SUPABASE_URL = url;
      process.env.SUPABASE_JWT_SECRET = secret;
    }
  });
});

describe("exchangeCode — guards", () => {
  it("rejects an origin outside the allowlist", async () => {
    const r = await exchangeCode({ code: "c", code_verifier: "v", origin: "https://evil.example.com" });
    expect(r.status).toBe(403);
    expect(state.tokenRequests).toHaveLength(0);
  });

  it("rejects missing parameters before calling the issuer", async () => {
    const r = await exchangeCode({ code: "", code_verifier: "", origin: ORIGIN });
    expect(r.status).toBe(400);
    expect(state.tokenRequests).toHaveLength(0);
  });
});
