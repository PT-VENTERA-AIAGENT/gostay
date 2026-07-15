// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { uuidV5, profileIdFor, roleForRealm, mintSupabaseToken, verifySupabaseToken } from "./identity";

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("uuidV5", () => {
  it("matches the RFC 4122 test vector", () => {
    // Widely published vector: uuid5(NAMESPACE_DNS, "python.org").
    // If this passes, the implementation is RFC-correct rather than merely
    // self-consistent.
    expect(uuidV5("python.org", DNS_NAMESPACE)).toBe("886313e1-3b8a-5372-9b90-0c9aee199e5d");
  });

  it("sets the version and variant bits", () => {
    const id = uuidV5("anything", DNS_NAMESPACE);
    expect(id[14]).toBe("5"); // version 5
    expect("89ab").toContain(id[19]); // RFC 4122 variant
  });

  it("is deterministic for the same subject", () => {
    expect(uuidV5("sub-abc", DNS_NAMESPACE)).toBe(uuidV5("sub-abc", DNS_NAMESPACE));
  });

  it("separates different subjects", () => {
    expect(uuidV5("sub-a", DNS_NAMESPACE)).not.toBe(uuidV5("sub-b", DNS_NAMESPACE));
  });

  it("separates the same subject in different namespaces", () => {
    const other = "b9c1a7d4-3e52-4f68-9a0b-7d2c5e814f36";
    expect(uuidV5("sub-a", DNS_NAMESPACE)).not.toBe(uuidV5("sub-a", other));
  });

  it("rejects a malformed namespace", () => {
    expect(() => uuidV5("x", "not-a-uuid")).toThrow();
  });
});

describe("profileIdFor", () => {
  const saved = process.env.SSO_UUID_NAMESPACE;
  afterEach(() => {
    if (saved === undefined) delete process.env.SSO_UUID_NAMESPACE;
    else process.env.SSO_UUID_NAMESPACE = saved;
  });

  it("is stable across calls — a returning user keeps their profile", () => {
    delete process.env.SSO_UUID_NAMESPACE;
    expect(profileIdFor("ventera|12345")).toBe(profileIdFor("ventera|12345"));
  });

  it("produces a real uuid for an opaque, non-uuid subject", () => {
    delete process.env.SSO_UUID_NAMESPACE;
    expect(profileIdFor("ventera|12345")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("roleForRealm", () => {
  const saved = { admin: process.env.SSO_ADMIN_REALMS, staff: process.env.SSO_STAFF_REALMS };
  beforeEach(() => {
    delete process.env.SSO_ADMIN_REALMS;
    delete process.env.SSO_STAFF_REALMS;
  });
  afterEach(() => {
    if (saved.admin === undefined) delete process.env.SSO_ADMIN_REALMS;
    else process.env.SSO_ADMIN_REALMS = saved.admin;
    if (saved.staff === undefined) delete process.env.SSO_STAFF_REALMS;
    else process.env.SSO_STAFF_REALMS = saved.staff;
  });

  it("denies by default — a guest is never staff", () => {
    expect(roleForRealm("customers")).toBe("customer");
    expect(roleForRealm("totally-made-up")).toBe("customer");
  });

  it("treats a missing realm as a guest", () => {
    expect(roleForRealm(undefined)).toBe("customer");
    expect(roleForRealm("")).toBe("customer");
  });

  it("grants admin to the default employee realm", () => {
    expect(roleForRealm("ventera-employees")).toBe("admin");
  });

  it("honours configured staff realms", () => {
    process.env.SSO_STAFF_REALMS = "gostay-frontdesk, gostay-reservations";
    expect(roleForRealm("gostay-frontdesk")).toBe("staff");
    expect(roleForRealm("gostay-reservations")).toBe("staff");
    expect(roleForRealm("gostay-cleaning")).toBe("customer");
  });

  it("lets the admin realm list be overridden", () => {
    process.env.SSO_ADMIN_REALMS = "hotel-owners";
    expect(roleForRealm("hotel-owners")).toBe("admin");
    // The built-in default no longer applies once overridden.
    expect(roleForRealm("ventera-employees")).toBe("customer");
  });
});

describe("mintSupabaseToken", () => {
  const SECRET = "test-jwt-secret-at-least-32-chars-long!!";
  const saved = process.env.SUPABASE_JWT_SECRET;
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = saved;
  });

  const input = {
    profileId: "886313e1-3b8a-5372-9b90-0c9aee199e5d",
    email: "staff@ventera.ai",
    issuedAt: 1_700_000_000,
    expiresAt: 1_700_003_600,
  };

  it("returns null when no secret is configured, rather than an unsigned token", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    expect(mintSupabaseToken(input)).toBeNull();
  });

  it("signs a token that verifies against the secret", () => {
    const token = mintSupabaseToken(input)!;
    expect(verifySupabaseToken(token, SECRET)).not.toBeNull();
  });

  it("carries the claims Supabase needs", () => {
    const claims = verifySupabaseToken(mintSupabaseToken(input)!, SECRET)!;
    // auth.uid() reads `sub` and casts it to uuid.
    expect(claims.sub).toBe(input.profileId);
    expect(claims.aud).toBe("authenticated");
    // The Postgres role PostgREST switches to — not the application role.
    expect(claims.role).toBe("authenticated");
    expect(claims.exp).toBe(input.expiresAt);
    expect(claims.iat).toBe(input.issuedAt);
    expect(claims.email).toBe("staff@ventera.ai");
  });

  it("never carries the application role, so a stale token cannot keep a privilege", () => {
    const claims = verifySupabaseToken(mintSupabaseToken(input)!, SECRET)!;
    expect(claims.role).not.toBe("admin");
    expect(claims).not.toHaveProperty("app_role");
    expect(claims).not.toHaveProperty("user_role");
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintSupabaseToken(input)!;
    expect(verifySupabaseToken(token, "wrong-secret")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = mintSupabaseToken(input)!;
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...input, sub: "00000000-0000-5000-8000-000000000000" }))
      .toString("base64url");
    expect(verifySupabaseToken(`${h}.${forged}.${s}`, SECRET)).toBeNull();
  });

  it("produces base64url segments with no padding", () => {
    const token = mintSupabaseToken(input)!;
    expect(token.split(".")).toHaveLength(3);
    expect(token).not.toContain("=");
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
  });
});
