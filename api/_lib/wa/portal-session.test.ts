// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const { client } = vi.hoisted(() => ({ client: { serviceGet: vi.fn() } }));
vi.mock("./client", () => client);

import { exchangePortalToken } from "./portal-session";
import { mintPortalToken } from "./portal-token";
import { verifySupabaseToken } from "../identity";

const SECRET = "rahasia-uji-yang-cukup-panjang-untuk-hmac!!";
const CUSTOMER = "cust-1";
const TENANT = "tenant-1";
const PROFILE = "prof-1";
const NOW = 1_800_000_000_000;

/** Baris customers + profil tergabung, sebagaimana dipulangkan PostgREST. */
function row(over: Record<string, unknown> = {}) {
  return {
    id: CUSTOMER,
    tenant_id: TENANT,
    full_name: "Sellora",
    email: "sellora@example.com",
    phone: "6285187586500",
    profiles: { id: PROFILE, role: "customer", is_active: true },
    ...over,
  };
}

function stub(rows: unknown[], ok = true) {
  client.serviceGet.mockResolvedValue({ ok, json: async () => rows });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_JWT_SECRET = SECRET;
  delete process.env.WA_PORTAL_TOKEN_SECRET;
  stub([row()]);
});

const token = () => mintPortalToken(CUSTOMER, TENANT, NOW)!;

describe("exchangePortalToken", () => {
  it("mints a session for the guest the token names", async () => {
    const r = await exchangePortalToken(token(), NOW);

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ profile_id: PROFILE, role: "customer", tenant_id: TENANT });
    const claims = verifySupabaseToken(r.body.supabase_token as string, SECRET)!;
    expect(claims.sub).toBe(PROFILE);
  });

  it("looks the guest up by BOTH id and hotel", async () => {
    // Tanpa syarat hotel, sebuah token hotel A bisa membuka tamu di hotel B.
    await exchangePortalToken(token(), NOW);
    const q = client.serviceGet.mock.calls[0][0] as string;
    expect(q).toContain(`id=eq.${CUSTOMER}`);
    expect(q).toContain(`tenant_id=eq.${TENANT}`);
  });

  it("refuses a token that was tampered with or expired", async () => {
    expect(await exchangePortalToken("bukan-token", NOW)).toMatchObject({ status: 401 });
    // TTL bawaan 30 hari.
    const jauhDiDepan = NOW + 31 * 24 * 60 * 60 * 1000;
    expect(await exchangePortalToken(token(), jauhDiDepan)).toMatchObject({ status: 401 });
  });

  it("NEVER mints a staff session, however the link was obtained", async () => {
    // Batas paling penting: sebuah tautan bocor tidak boleh menjadi pintu ke
    // dashboard. Bahkan bila seorang staf punya baris customer.
    stub([row({ profiles: { id: PROFILE, role: "staff", is_active: true } })]);
    const r = await exchangePortalToken(token(), NOW);
    expect(r).toMatchObject({ status: 403, body: { error: "not_a_guest" } });
  });

  it("honours a deactivated account", async () => {
    stub([row({ profiles: { id: PROFILE, role: "customer", is_active: false } })]);
    expect(await exchangePortalToken(token(), NOW)).toMatchObject({ status: 403 });
  });

  it("refuses when the guest no longer exists at that hotel", async () => {
    stub([]);
    expect(await exchangePortalToken(token(), NOW)).toMatchObject({ status: 401 });
  });

  it("refuses a guest row with no profile — auth.uid() must point at a real row", async () => {
    stub([row({ profiles: null })]);
    expect(await exchangePortalToken(token(), NOW)).toMatchObject({ status: 401 });
  });

  it("says the same thing for every refusal, so the link cannot be probed", async () => {
    stub([]);
    const missing = await exchangePortalToken(token(), NOW);
    const junk = await exchangePortalToken("bukan-token", NOW);
    expect(missing.body).toEqual(junk.body);
  });

  it("surfaces a lookup failure as a server fault, not a bad token", async () => {
    stub([], false);
    expect(await exchangePortalToken(token(), NOW)).toMatchObject({ status: 502 });
  });

  it("issues a SHORT session even though the link is long-lived", async () => {
    const r = await exchangePortalToken(token(), NOW);
    expect(r.body.expires_in).toBe(3600);
  });
});
