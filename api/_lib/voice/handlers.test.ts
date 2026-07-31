// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Yang menyentuh dunia luar di-mock: PostgREST (../wa/client) dan profil bot
// (../wa/crm). Verifikasi JWT (../identity) tetap ASLI — token diuji dengan
// tanda tangan sungguhan, karena gerbang itulah yang dites.

const { client, crm } = vi.hoisted(() => ({
  client: { serviceGet: vi.fn(), serviceInsert: vi.fn() },
  crm: { getOrCreateBotProfile: vi.fn() },
}));

vi.mock("../wa/client", () => client);
vi.mock("../wa/crm", () => crm);

import { handleVoiceSession, handleVoiceCallEnded } from "./handlers";
import { mintSupabaseToken } from "../identity";

const SECRET = "voice-secret-uji";

function jsonResponse(rows: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => rows } as Response;
}

/** JWT staf yang sah, ditandatangani SUPABASE_JWT_SECRET asli (di-set test). */
function staffJwt(profileId = "prof-1"): string {
  const now = Math.floor(Date.now() / 1000);
  return mintSupabaseToken({ profileId, issuedAt: now, expiresAt: now + 3600 })!;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_JWT_SECRET = "jwt-secret-uji";
  process.env.OPENAI_API_KEY = "sk-uji";
  process.env.VOICE_WEBHOOK_SECRET = SECRET;
  delete process.env.VOICE_REALTIME_MODEL;
  crm.getOrCreateBotProfile.mockResolvedValue("bot-profile-1");
});

// ─── session ─────────────────────────────────────────────────────────────────
describe("handleVoiceSession", () => {
  function profileRow(role = "staff", active = true) {
    client.serviceGet.mockResolvedValue(
      jsonResponse([{ id: "prof-1", role, is_active: active }]),
    );
  }

  it("mints an ephemeral session (bentuk GA client_secrets) for an active staff JWT", async () => {
    profileRow("staff");
    const fakeFetch = (async (url: string, init: RequestInit) => {
      // Jalur beta /v1/realtime/sessions sudah 404 di produksi — GA wajib.
      expect(url).toContain("/v1/realtime/client_secrets");
      const sent = JSON.parse(String(init.body));
      expect(sent.session).toMatchObject({ type: "realtime", model: "gpt-realtime" });
      expect(sent.session.audio.output.voice).toBe("marin");
      const h = init.headers as Record<string, string>;
      expect(h.Authorization).toBe("Bearer sk-uji");
      return jsonResponse({ value: "ek_abc", expires_at: 1234567890 });
    }) as unknown as typeof fetch;

    const r = await handleVoiceSession(`Bearer ${staffJwt()}`, fakeFetch);
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) {
      // Dinormalkan ke client_secret.value — kontrak yang dibaca halaman.
      expect((r.payload.client_secret as { value: string }).value).toBe("ek_abc");
      expect(r.payload.model).toBe("gpt-realtime");
    }
  });

  it("401s a missing/garbage/forged token without calling OpenAI", async () => {
    const spy = vi.fn();
    for (const header of [undefined, "Bearer bukan.jwt.sah", "Bearer "]) {
      const r = await handleVoiceSession(header, spy as unknown as typeof fetch);
      expect(r).toEqual({ ok: false, status: 401, error: "unauthorized" });
    }
    // Tanda tangan dari secret lain — bentuknya JWT sah, kuncinya bukan.
    process.env.SUPABASE_JWT_SECRET = "jwt-secret-lain";
    const forged = staffJwt();
    process.env.SUPABASE_JWT_SECRET = "jwt-secret-uji";
    expect(await handleVoiceSession(`Bearer ${forged}`, spy as unknown as typeof fetch))
      .toEqual({ ok: false, status: 401, error: "unauthorized" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("401s a CUSTOMER token — hanya staf/admin yang boleh membuka mic hotel", async () => {
    profileRow("customer");
    const r = await handleVoiceSession(`Bearer ${staffJwt()}`, vi.fn() as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("401s a deactivated profile and an expired token", async () => {
    profileRow("staff", false);
    expect(await handleVoiceSession(`Bearer ${staffJwt()}`, vi.fn() as unknown as typeof fetch))
      .toEqual({ ok: false, status: 401, error: "unauthorized" });

    const now = Math.floor(Date.now() / 1000);
    const expired = mintSupabaseToken({ profileId: "prof-1", issuedAt: now - 7200, expiresAt: now - 3600 })!;
    expect(await handleVoiceSession(`Bearer ${expired}`, vi.fn() as unknown as typeof fetch))
      .toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("502s (bukan bocor detail) ketika OpenAI menolak", async () => {
    profileRow("staff");
    const fakeFetch = (async () => jsonResponse({ error: { message: "bad key" } }, 401)) as unknown as typeof fetch;
    const r = await handleVoiceSession(`Bearer ${staffJwt()}`, fakeFetch);
    expect(r).toEqual({ ok: false, status: 502, error: "realtime_session_failed" });
  });
});

// ─── call-ended ──────────────────────────────────────────────────────────────
describe("handleVoiceCallEnded", () => {
  const payload = {
    hotel: "lor-kali",
    caller_phone: "+62812000111",
    caller_name: "Budi",
    duration_seconds: 95,
    summary: "Tanya harga Deluxe",
    transcript: "AI: halo\nTamu: harga deluxe?",
    follow_up: true,
    follow_up_due: "2026-08-01",
  };

  function stubDb(opts: { customerExists?: boolean } = {}) {
    client.serviceGet.mockImplementation(async (path: string) => {
      if (path.startsWith("tenants?")) return jsonResponse([{ id: "tn-1" }]);
      if (path.startsWith("customers?")) {
        return jsonResponse(opts.customerExists ? [{ id: "cust-lama" }] : []);
      }
      throw new Error(`unexpected serviceGet ${path}`);
    });
    client.serviceInsert.mockImplementation(async (table: string) => {
      if (table === "customers") return jsonResponse([{ id: "cust-baru" }], 201);
      if (table === "call_logs") return jsonResponse([{ id: "log-1" }], 201);
      throw new Error(`unexpected insert ${table}`);
    });
  }

  it("401s the wrong (or missing) secret without touching the database", async () => {
    expect(await handleVoiceCallEnded("salah", payload)).toMatchObject({ ok: false, status: 401 });
    expect(await handleVoiceCallEnded(undefined, payload)).toMatchObject({ ok: false, status: 401 });
    expect(client.serviceGet).not.toHaveBeenCalled();
  });

  it("creates the CRM guest for an unknown number and writes the AI call log", async () => {
    stubDb({ customerExists: false });
    const r = await handleVoiceCallEnded(SECRET, payload);
    expect(r).toMatchObject({
      ok: true, status: 200, callLogId: "log-1", customerId: "cust-baru", customerCreated: true,
    });

    const [, customerRow] = client.serviceInsert.mock.calls.find((c) => c[0] === "customers")!;
    expect(customerRow).toMatchObject({
      tenant_id: "tn-1",
      full_name: "Budi",
      email: "phone-62812000111@noreply.ventera.id", // konvensi WA/walk-in
      phone: "62812000111",
    });

    const [, logRow] = client.serviceInsert.mock.calls.find((c) => c[0] === "call_logs")!;
    expect(logRow).toMatchObject({
      tenant_id: "tn-1",
      agent_id: "bot-profile-1", // profil bot, bukan manusia
      customer_id: "cust-baru",
      direction: "inbound",
      duration_seconds: 95,
      transcript: payload.transcript,
      follow_up: true,
      follow_up_due: "2026-08-01",
      source: "ai",
    });
  });

  it("normalises 08… to 62… and matches by tail — no duplicate for +62 guests", async () => {
    stubDb({ customerExists: true });
    const r = await handleVoiceCallEnded(SECRET, { ...payload, caller_phone: "083862927534" });
    expect(r).toMatchObject({ ok: true, customerCreated: false });
    const lookup = client.serviceGet.mock.calls.find((c) => String(c[0]).startsWith("customers?"))![0] as string;
    // Ekor tanpa kode negara: cocok untuk "+62838…", "62838…", maupun "0838…".
    expect(decodeURIComponent(lookup)).toContain("phone=ilike.%83862927534");
  });

  it("links an EXISTING guest instead of duplicating them", async () => {
    stubDb({ customerExists: true });
    const r = await handleVoiceCallEnded(SECRET, payload);
    expect(r).toMatchObject({ ok: true, customerId: "cust-lama", customerCreated: false });
    expect(client.serviceInsert.mock.calls.filter((c) => c[0] === "customers")).toHaveLength(0);
  });

  it("400s when hotel or caller_phone is missing; 404s an unknown hotel slug", async () => {
    stubDb();
    expect(await handleVoiceCallEnded(SECRET, { caller_phone: "0812" })).toMatchObject({ status: 400 });
    expect(await handleVoiceCallEnded(SECRET, { hotel: "lor-kali" })).toMatchObject({ status: 400 });

    client.serviceGet.mockResolvedValue(jsonResponse([]));
    expect(await handleVoiceCallEnded(SECRET, payload)).toMatchObject({ status: 404, error: "hotel_not_found" });
  });

  it("drops follow_up_due when follow_up is false, and junk durations become null", async () => {
    stubDb();
    await handleVoiceCallEnded(SECRET, {
      ...payload, follow_up: false, duration_seconds: -3,
    });
    const [, logRow] = client.serviceInsert.mock.calls.find((c) => c[0] === "call_logs")!;
    expect(logRow).toMatchObject({ follow_up: false, follow_up_due: null, duration_seconds: null });
  });
});
