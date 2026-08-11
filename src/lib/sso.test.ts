import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshSessionAuthority, signupContextFor, type SsoSession } from "./sso";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("signupContextFor", () => {
  it("treats the main application login as owner onboarding", () => {
    expect(signupContextFor("/")).toBe("owner");
    expect(signupContextFor("/create-hotel")).toBe("owner");
    expect(signupContextFor("/dashboard")).toBe("owner");
  });

  it("keeps hotel portal deep links in guest mode", () => {
    expect(signupContextFor("/portal")).toBe("guest");
    expect(signupContextFor("/portal/book/review")).toBe("guest");
    expect(signupContextFor("/portal/profile")).toBe("guest");
  });
});

describe("refreshSessionAuthority", () => {
  it("replaces a stale client role with the role enforced by the database", async () => {
    const session: SsoSession = {
      claims: { sub: "rafli" },
      access_token: "sso-access",
      supabase_token: "signed-supabase-token",
      expires_at: Date.now() + 60_000,
      role: "customer",
      tenant_id: null,
    };
    sessionStorage.setItem("gostay_sso_session", JSON.stringify(session));

    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify("admin"), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify("tenant-lor-kali"), { status: 200 }),
      );

    const refreshed = await refreshSessionAuthority(session, {
      request,
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });

    expect(refreshed.role).toBe("admin");
    expect(refreshed.tenant_id).toBe("tenant-lor-kali");
    expect(JSON.parse(sessionStorage.getItem("gostay_sso_session") ?? "{}")).toMatchObject({
      role: "admin",
      tenant_id: "tenant-lor-kali",
    });
  });
});
