// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { resolveOrProvisionGuest, WaRateLimitError, phoneDigits } from "./guest";
import { profileIdFor } from "../identity";

const PHONE_JID = "628123456789@s.whatsapp.net";
const DIGITS = "628123456789";
const TENANT = "11111111-1111-4111-8111-111111111111";
const SSO_SUB = "ventera|wa-628123456789";

/** One mock standing in for both Supabase PostgREST and the Ventera provision endpoint. */
interface MockState {
  // wa_guest_identities the GET should return (the resolve short-circuit).
  identityRows: Array<{ id: string; sso_sub: string | null; profile_id: string | null; customer_id: string | null }>;
  // profiles / customers the respective GETs return (empty = "not provisioned yet").
  profileRows: Array<{ id: string; role: string; is_active: boolean }>;
  customerRows: Array<{ id: string }>;

  // Recorded writes / calls.
  venteraCalls: Array<{ auth: string | undefined; body: Record<string, unknown> }>;
  rpcCalls: Array<Record<string, unknown>>;
  profileInserts: Array<Record<string, unknown>>;
  customerInserts: Array<Record<string, unknown>>;
  identityInserts: Array<Record<string, unknown>>;
  identityPatches: Array<Record<string, unknown>>;

  // Tunables per test.
  rateAllowed: boolean;
  venteraStatus: number;
  venteraSub: string | undefined;
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
    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    // ── Ventera provision ──
    if (url.pathname === "/api/admin/users/provision") {
      state.venteraCalls.push({
        auth: req.headers.authorization,
        body: JSON.parse(body || "{}"),
      });
      if (state.venteraStatus !== 200) {
        json(state.venteraStatus, { error: "provision_failed" });
        return;
      }
      json(200, { ok: true, sub: state.venteraSub, created: true });
      return;
    }

    // ── rate-limit RPC ──
    if (url.pathname === "/rest/v1/rpc/check_wa_rate_limit") {
      state.rpcCalls.push(JSON.parse(body || "{}"));
      json(200, state.rateAllowed);
      return;
    }

    // ── wa_guest_identities ──
    if (url.pathname === "/rest/v1/wa_guest_identities") {
      if (req.method === "GET") return json(200, state.identityRows);
      if (req.method === "POST") {
        state.identityInserts.push(JSON.parse(body));
        return json(201, []);
      }
      if (req.method === "PATCH") {
        state.identityPatches.push(JSON.parse(body));
        return json(200, []);
      }
    }

    // ── profiles ──
    if (url.pathname === "/rest/v1/profiles") {
      if (req.method === "GET") return json(200, state.profileRows);
      if (req.method === "POST") {
        const row = JSON.parse(body);
        state.profileInserts.push(row);
        return json(201, [{ role: "customer", is_active: true, ...row }]);
      }
      if (req.method === "PATCH") return json(200, state.profileRows);
    }

    // ── customers ──
    if (url.pathname === "/rest/v1/customers") {
      if (req.method === "GET") return json(200, state.customerRows);
      if (req.method === "POST") {
        const row = JSON.parse(body);
        state.customerInserts.push(row);
        return json(201, [{ id: "cust-new-1", ...row }]);
      }
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.SSO_VENTERA_PROVISION_URL = base;
  process.env.PROVISION_API_KEY = "provision-key-abc";
  delete process.env.SSO_UUID_NAMESPACE;
  delete process.env.TENANT_SLUG;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = {
    identityRows: [],
    profileRows: [],
    customerRows: [],
    venteraCalls: [],
    rpcCalls: [],
    profileInserts: [],
    customerInserts: [],
    identityInserts: [],
    identityPatches: [],
    rateAllowed: true,
    venteraStatus: 200,
    venteraSub: SSO_SUB,
  };
});

describe("phoneDigits", () => {
  it("strips the WhatsApp suffix and non-digits", () => {
    expect(phoneDigits("628123456789@s.whatsapp.net")).toBe("628123456789");
    expect(phoneDigits("+62 812-3456:1@s.whatsapp.net")).toBe("6281234561");
  });
});

describe("resolveOrProvisionGuest", () => {
  it("(a) returns the stored ids for a known number without calling Ventera", async () => {
    state.identityRows = [{ id: "idn-1", sso_sub: SSO_SUB, profile_id: "prof-1", customer_id: "cust-1" }];

    const out = await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");

    expect(out).toEqual({ profileId: "prof-1", customerId: "cust-1", ssoSub: SSO_SUB });
    // Short-circuit: no provisioning side effects at all.
    expect(state.venteraCalls).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.profileInserts).toHaveLength(0);
    expect(state.customerInserts).toHaveLength(0);
    expect(state.identityInserts).toHaveLength(0);
  });

  it("(b) provisions a new guest: Ventera + profile + customer + identity", async () => {
    const out = await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi Santoso");

    // Ventera called once, authenticated, with the bare digits.
    expect(state.venteraCalls).toHaveLength(1);
    expect(state.venteraCalls[0].auth).toBe("Bearer provision-key-abc");
    expect(state.venteraCalls[0].body).toMatchObject({ phone: DIGITS, displayName: "Budi Santoso" });
    // realm is not sent — Ventera defaults it.
    expect(state.venteraCalls[0].body).not.toHaveProperty("realm");

    // profileId derives from the SSO sub, same as the web flow.
    const expectedProfileId = profileIdFor(SSO_SUB);
    expect(out.profileId).toBe(expectedProfileId);
    expect(out.ssoSub).toBe(SSO_SUB);
    expect(out.customerId).toBe("cust-new-1");

    // profiles row: service-role, tenant explicit, no role sent (DB decides).
    expect(state.profileInserts).toHaveLength(1);
    expect(state.profileInserts[0]).toMatchObject({
      id: expectedProfileId,
      sso_sub: SSO_SUB,
      tenant_id: TENANT,
      full_name: "Budi Santoso",
    });
    expect(state.profileInserts[0]).not.toHaveProperty("role");

    // customers row: profile_id chains it to the person; tenant explicit.
    expect(state.customerInserts).toHaveLength(1);
    expect(state.customerInserts[0]).toMatchObject({
      profile_id: expectedProfileId,
      tenant_id: TENANT,
      full_name: "Budi Santoso",
      phone: DIGITS,
    });

    // identity row written back with all three ids for next time.
    expect(state.identityInserts).toHaveLength(1);
    expect(state.identityInserts[0]).toMatchObject({
      tenant_id: TENANT,
      phone_jid: PHONE_JID,
      sso_sub: SSO_SUB,
      profile_id: expectedProfileId,
      customer_id: "cust-new-1",
    });
  });

  it("(b') falls back to the number as the name when no pushName is given", async () => {
    await resolveOrProvisionGuest(PHONE_JID, TENANT);
    expect(state.venteraCalls[0].body).not.toHaveProperty("displayName");
    expect(state.profileInserts[0]).toMatchObject({ full_name: DIGITS });
  });

  it("(c) throws WaRateLimitError and provisions nothing when the limiter denies", async () => {
    state.rateAllowed = false;

    await expect(resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi")).rejects.toBeInstanceOf(WaRateLimitError);

    expect(state.venteraCalls).toHaveLength(0);
    expect(state.profileInserts).toHaveLength(0);
    expect(state.customerInserts).toHaveLength(0);
    expect(state.identityInserts).toHaveLength(0);
  });

  it("(d) falls back to a local identity when Ventera fails", async () => {
    state.venteraStatus = 500;

    const out = await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");

    // Ventera was attempted; a local WA-scoped identity was used instead, and the
    // guest is still fully provisioned (profile + customer + identity).
    expect(state.venteraCalls).toHaveLength(1);
    expect(out.ssoSub).toBe(`wa:${PHONE_JID}`);
    expect(out.profileId).toBe(profileIdFor(`wa:${PHONE_JID}`));
    expect(state.profileInserts).toHaveLength(1);
    expect(state.customerInserts).toHaveLength(1);
    expect(state.identityInserts).toHaveLength(1);
  });

  it("(d') falls back to local when Ventera returns 200 but no sub", async () => {
    state.venteraSub = undefined;

    const out = await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");
    expect(out.ssoSub).toBe(`wa:${PHONE_JID}`);
    expect(state.profileInserts).toHaveLength(1);
  });

  it("patches a half-provisioned identity row instead of inserting a duplicate", async () => {
    // Identity exists but was never completed (no profile_id/customer_id).
    state.identityRows = [{ id: "idn-9", sso_sub: null, profile_id: null, customer_id: null }];

    await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");

    expect(state.identityInserts).toHaveLength(0);
    expect(state.identityPatches).toHaveLength(1);
    expect(state.identityPatches[0]).toMatchObject({
      sso_sub: SSO_SUB,
      profile_id: profileIdFor(SSO_SUB),
      customer_id: "cust-new-1",
    });
  });
});
