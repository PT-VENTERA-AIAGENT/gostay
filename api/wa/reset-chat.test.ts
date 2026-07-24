// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./reset-chat";
import { mintSupabaseToken } from "../_lib/identity";

const THREAD = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const TENANT = "33333333-3333-4333-8333-333333333333";
const PROFILE = "44444444-4444-4444-8444-444444444444";
const PHONE = "628123456789@s.whatsapp.net";

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("POST /api/wa/reset-chat", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.SUPABASE_JWT_SECRET = "jwt-secret";
  });

  it("clears pending state and all limiter namespaces without deleting chat data", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });

      if (url.includes("/rest/v1/chat_threads?")) return response(200, [{ customer_id: CUSTOMER }]);
      if (url.includes("/rest/v1/customers?")) return response(200, [{ tenant_id: TENANT }]);
      if (url.includes("/rest/v1/profiles?")) return response(200, [{ role: "staff", is_active: true, tenant_id: TENANT }]);
      if (url.includes("/rest/v1/wa_guest_identities?")) return response(200, [{ phone_jid: PHONE }]);
      if (method === "DELETE") return response(204, null);
      return response(404, { error: "unexpected_request" });
    }));

    const token = mintSupabaseToken({
      profileId: PROFILE,
      issuedAt: Math.floor(Date.now() / 1000) - 10,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    const result: { status?: number; body?: unknown } = {};
    await handler(
      { method: "POST", headers: { authorization: `Bearer ${token}` }, body: { threadId: THREAD } },
      {
        status(code) { result.status = code; return this; },
        json(body) { result.body = body; },
        setHeader() { /* no-op */ },
      },
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, phoneJids: [PHONE], resetCount: 1 });
    const deletes = calls.filter((call) => call.method === "DELETE");
    expect(deletes).toHaveLength(4);
    expect(deletes.map((call) => call.url).join("\n")).toContain("wa_pending_actions");
    expect(deletes.map((call) => call.url).join("\n")).toContain("greet%3A");
    expect(deletes.map((call) => call.url).join("\n")).toContain("reply%3A");
    expect(deletes.map((call) => call.url).join("\n")).toContain("wa_rate_limits");
  });
});

