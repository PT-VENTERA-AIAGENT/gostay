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
  profileRows: Array<{
    id: string;
    role: string;
    is_active?: boolean;
    email?: string;
    full_name?: string;
    tenant_id?: string | null;
  }>;
  inserts: Array<Record<string, unknown>>;
  patches: Array<Record<string, unknown>>;
  realm: string | undefined;
  tokenStatus: number;
  tokenError: string;
  /** The id a tenants?slug=... lookup resolves to (null = no such active hotel). */
  tenantId: string | null;
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
        res.end(JSON.stringify({
          error: state.tokenError,
          // An issuer can echo the request back at us, secret and all. Whatever
          // the handler returns must never contain this.
          error_description: "the request included client_secret=LEAKED",
          client_secret: "LEAKED",
        }));
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
    if (url.pathname === "/rest/v1/tenants" && req.method === "GET") {
      // resolveTenantId() looks a slug up here. Return a single row when the
      // test has armed a tenant id, else empty (unknown/inactive slug).
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state.tenantId ? [{ id: state.tenantId }] : []));
      return;
    }

    if (url.pathname === "/rest/v1/profiles") {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(state.profileRows));
        return;
      }
      if (req.method === "POST") {
        const row = JSON.parse(body);
        state.inserts.push(row);
        // Emulate the column defaults:
        //   role user_role not null default 'customer'   (001)
        //   is_active boolean not null default true      (004)
        const stored = { role: "customer", is_active: true, ...row };
        state.profileRows.push(stored);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify([stored]));
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
  delete process.env.SSO_UUID_NAMESPACE;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = {
    tokenRequests: [], profileRows: [], inserts: [], patches: [],
    realm: "ventera-employees", tokenStatus: 200, tokenError: "invalid_grant",
    tenantId: null,
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
    // error_description is free text and is dropped entirely.
    expect(JSON.stringify(r.body)).not.toContain("error_description");
  });

  it("passes through the OAuth error code so a dead login is diagnosable", async () => {
    // A bare 502 gives the operator nothing: a missing client secret and an
    // expired code look identical. The code itself is a closed vocabulary.
    state.tokenStatus = 401;
    state.tokenError = "invalid_client";
    const r = await call();
    expect(r.body).toEqual({ error: "token_exchange_failed", reason: "invalid_client" });
  });

  it("drops an upstream error code that is not a known OAuth one", async () => {
    // Anything outside RFC 6749 §5.2 could be arbitrary text from the issuer,
    // so it is not echoed to the browser.
    state.tokenStatus = 400;
    state.tokenError = "secret was LEAKED and here it is";
    const r = await call();
    expect(r.body).toEqual({ error: "token_exchange_failed" });
    expect(JSON.stringify(r.body)).not.toContain("LEAKED");
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

  it("creates the profile on first login", async () => {
    const r = await call();
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      id: profileIdFor(SSO_SUB),
      sso_sub: SSO_SUB,
      email: "staff@ventera.ai",
      full_name: "Rafli Staff",
    });
    expect(state.inserts[0].last_seen_at).toBeTruthy();
    // Least-privilege default: a plain web signup is a portal-only customer.
    // Hotel staff come from onboarding / self-serve tenant creation, not here.
    expect(r.body.role).toBe("customer");
  });

  it("creates a web profile as customer by default", async () => {
    await call();
    expect(state.inserts[0].role).toBe("customer");
    // Main-app login is prospective-owner onboarding. Explicit NULL prevents
    // the database's single-hotel default from attaching it to that hotel.
    expect(state.inserts[0].tenant_id).toBeNull();
  });

  it("files a new guest under the hotel from their portal link (?hotel slug)", async () => {
    state.tenantId = "11111111-1111-4111-8111-111111111111";
    const r = await exchangeCode({
      code: "auth-code",
      code_verifier: "verifier-123",
      origin: ORIGIN,
      tenantSlug: "kopi-rintik",
      signupContext: "guest",
    });
    expect(r.status).toBe(200);
    expect(state.inserts[0].tenant_id).toBe(state.tenantId);
    // A guest joining via a link is still only ever a customer.
    expect(state.inserts[0].role).toBe("customer");
  });

  it("ignores a portal-link slug that names no active hotel, without failing sign-in", async () => {
    state.tenantId = null; // the slug resolves to nothing
    const r = await exchangeCode({
      code: "auth-code",
      code_verifier: "verifier-123",
      origin: ORIGIN,
      tenantSlug: "does-not-exist",
      signupContext: "guest",
    });
    expect(r.status).toBe(200);
    // Falls through to the deployment default (TENANT_SLUG unset here) → no
    // tenant_id sent, so the column default applies rather than a hard failure.
    expect(state.inserts[0]).not.toHaveProperty("tenant_id");
  });

  it("ignores stale/default hotel hints during owner onboarding", async () => {
    state.tenantId = "11111111-1111-4111-8111-111111111111";
    const previous = process.env.TENANT_SLUG;
    process.env.TENANT_SLUG = "gostay";
    try {
      const r = await exchangeCode({
        code: "auth-code",
        code_verifier: "verifier-123",
        origin: ORIGIN,
        tenantSlug: "gostay",
        signupContext: "owner",
      });
      expect(r.status).toBe(200);
      expect(state.inserts[0].tenant_id).toBeNull();
      expect(r.body.tenant_id).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.TENANT_SLUG;
      else process.env.TENANT_SLUG = previous;
    }
  });

  it("honours SSO_SIGNUP_ROLE override", async () => {
    const prev = process.env.SSO_SIGNUP_ROLE;
    process.env.SSO_SIGNUP_ROLE = "staff";
    try {
      const r = await call();
      expect(state.inserts[0].role).toBe("staff");
      expect(r.body.role).toBe("staff");
    } finally {
      if (prev === undefined) delete process.env.SSO_SIGNUP_ROLE;
      else process.env.SSO_SIGNUP_ROLE = prev;
    }
  });

  it("ignores the realm entirely, even a privileged-looking one", async () => {
    // The role is a fixed server-side default, never read from the realm: a
    // different realm claim changes nothing about what gets stored.
    state.realm = "ventera-employees";
    const r = await call();
    expect(state.inserts[0].role).toBe("customer");
    expect(r.body.role).toBe("customer");
    state.inserts = [];
    state.profileRows = [];
    state.realm = "customers";
    const r2 = await call();
    expect(r2.body.role).toBe("customer");
  });

  it("gives the same result whatever the realm claims", async () => {
    state.realm = "admins";
    const first = await call();
    state.inserts = [];
    state.profileRows = [];
    state.realm = undefined;
    const second = await call();
    expect(first.body.role).toBe(second.body.role);
  });

  it("records last_seen_at on a returning sign-in", async () => {
    state.profileRows = [{ id: profileIdFor(SSO_SUB), role: "staff", is_active: true }];
    await call();
    expect(state.patches[0].last_seen_at).toBeTruthy();
  });

  it("does not overwrite a role an admin granted after first login", async () => {
    // The admin promoted this user in User Management; signing in again must
    // not undo that.
    state.profileRows = [{ id: profileIdFor(SSO_SUB), role: "admin", is_active: true }];
    const r = await call();

    expect(state.inserts).toHaveLength(0);
    expect(r.body.role).toBe("admin");
    // Contact details still refresh; role is deliberately absent from the patch.
    expect(state.patches).toHaveLength(1);
    expect(state.patches[0]).not.toHaveProperty("role");
    expect(state.patches[0]).toMatchObject({ email: "staff@ventera.ai" });
  });

  it("reports the stored role, which is what RLS enforces", async () => {
    state.profileRows = [{
      id: profileIdFor(SSO_SUB),
      role: "staff",
      is_active: true,
      tenant_id: "11111111-1111-4111-8111-111111111111",
    }];
    const r = await call();
    expect(r.body.role).toBe("staff");
    expect(r.body.tenant_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("refuses to mint a token for a deactivated user", async () => {
    // Even an admin: deactivation outranks the role. No token means the client
    // falls back to anon and reads only public data.
    state.profileRows = [{ id: profileIdFor(SSO_SUB), role: "admin", is_active: false }];
    const r = await call();
    expect(r.status).toBe(200); // the SSO login itself is still valid
    expect(r.body.supabase_token).toBeNull();
    expect(r.body.role).toBeNull();
  });

  it("reports no role when provisioning fails, rather than guessing one", async () => {
    // A null role denies every gated route in the UI — the right answer when we
    // do not know what the database would say.
    const url = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "http://127.0.0.1:1"; // nothing listening
    try {
      const r = await call();
      expect(r.status).toBe(200);
      expect(r.body.role).toBeNull();
    } finally {
      process.env.SUPABASE_URL = url;
    }
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
