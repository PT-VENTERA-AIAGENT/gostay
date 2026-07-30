// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mintPortalToken, readPortalToken } from "./portal-token";

const SECRET = "rahasia-uji-yang-cukup-panjang-untuk-hmac!!";
const CUSTOMER = "cust-1";
const TENANT = "tenant-1";
const NOW = 1_800_000_000_000;

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = SECRET;
  delete process.env.WA_PORTAL_TOKEN_SECRET;
  delete process.env.WA_PORTAL_TOKEN_TTL_DAYS;
});
afterEach(() => {
  delete process.env.WA_PORTAL_TOKEN_TTL_DAYS;
  delete process.env.WA_PORTAL_TOKEN_SECRET;
});

describe("mintPortalToken / readPortalToken", () => {
  it("round-trips the guest and the hotel it is for", () => {
    const t = mintPortalToken(CUSTOMER, TENANT, NOW)!;
    expect(readPortalToken(t, NOW)).toMatchObject({ customerId: CUSTOMER, tenantId: TENANT });
  });

  it("refuses a token whose payload was edited", () => {
    // Inti dari menandatangani: mengubah tamu yang dituju harus merusaknya.
    const t = mintPortalToken(CUSTOMER, TENANT, NOW)!;
    const [body, sig] = t.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), customerId: "cust-lain" }),
    ).toString("base64url");
    expect(readPortalToken(`${tampered}.${sig}`, NOW)).toBeNull();
  });

  it("refuses a token signed with a different secret", () => {
    const t = mintPortalToken(CUSTOMER, TENANT, NOW)!;
    process.env.SUPABASE_JWT_SECRET = "rahasia-lain-yang-juga-panjang-sekali!!";
    expect(readPortalToken(t, NOW)).toBeNull();
  });

  it("expires — a link lives forever in a chat, a key must not", () => {
    process.env.WA_PORTAL_TOKEN_TTL_DAYS = "1";
    const t = mintPortalToken(CUSTOMER, TENANT, NOW)!;
    const oneDay = 24 * 60 * 60 * 1000;
    expect(readPortalToken(t, NOW + oneDay - 1000)).not.toBeNull();
    expect(readPortalToken(t, NOW + oneDay + 1000)).toBeNull();
  });

  it("refuses junk rather than throwing", () => {
    for (const bad of ["", "abc", "abc.", ".abc", "a.b.c", "!!!.???"]) {
      expect(readPortalToken(bad, NOW)).toBeNull();
    }
    expect(readPortalToken(undefined, NOW)).toBeNull();
    expect(readPortalToken(null, NOW)).toBeNull();
  });

  it("mints nothing when no secret is configured — and reads nothing either", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    expect(mintPortalToken(CUSTOMER, TENANT, NOW)).toBeNull();
    expect(readPortalToken("apa.pun", NOW)).toBeNull();
  });

  it("mints nothing without both a guest and a hotel", () => {
    expect(mintPortalToken("", TENANT, NOW)).toBeNull();
    expect(mintPortalToken(CUSTOMER, "", NOW)).toBeNull();
  });

  it("can be rotated separately from the Supabase secret", () => {
    process.env.WA_PORTAL_TOKEN_SECRET = "rahasia-khusus-tautan-portal-yang-panjang";
    const t = mintPortalToken(CUSTOMER, TENANT, NOW)!;
    expect(readPortalToken(t, NOW)).not.toBeNull();
    // Ditandatangani rahasia khusus, jadi rahasia Supabase saja tidak cukup.
    delete process.env.WA_PORTAL_TOKEN_SECRET;
    expect(readPortalToken(t, NOW)).toBeNull();
  });
});
