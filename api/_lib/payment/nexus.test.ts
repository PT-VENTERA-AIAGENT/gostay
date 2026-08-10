// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

import {
  randomReferenceSuffix,
  merchantCodeFor,
  jakartaYyyymmdd,
  newNexusReference,
  verifyNexusSignature,
  createNexusPayment,
  ensureNexusMerchant,
  listNexusPaymentsUpdatedSince,
  isNexusConfigured,
} from "./nexus";

const SANDBOX_SECRET = "rahasia-sandbox";
const PROD_SECRET = "rahasia-production";

beforeEach(() => {
  process.env.NEXUS_API_KEY_SANDBOX = "nxs_sandbox_abc";
  process.env.NEXUS_API_KEY_PRODUCTION = "nxs_live_abc";
  process.env.NEXUS_SIGNING_SECRET_SANDBOX = SANDBOX_SECRET;
  process.env.NEXUS_SIGNING_SECRET_PRODUCTION = PROD_SECRET;
  delete process.env.NEXUS_API_URL;
});

// ─── Reference (kontrak §3) ──────────────────────────────────────────────────
describe("reference", () => {
  it("suffix: 8 karakter Crockford Base32 — tanpa I, L, O, U", () => {
    for (let i = 0; i < 50; i++) {
      expect(randomReferenceSuffix()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });

  it("merchant code: slug hotel → huruf besar, TANPA pemisah apa pun", () => {
    expect(merchantCodeFor("lor-kali")).toBe("LORKALI");
    expect(merchantCodeFor("hotel bintang 5!")).toBe("HOTELBINTANG5");
    expect(merchantCodeFor(null)).toBe("HOTEL");
  });

  it("tanggal memakai zona Asia/Jakarta, bukan UTC", () => {
    // 30 Jul 17:30 UTC = 31 Jul 00:30 WIB — hari sudah berganti di Jakarta.
    expect(jakartaYyyymmdd(new Date("2026-07-30T17:30:00Z"))).toBe("20260731");
    expect(jakartaYyyymmdd(new Date("2026-07-30T16:59:00Z"))).toBe("20260730");
  });

  it("bentuk penuh: {MERCHANT}-{YYYYMMDD}-{ACAK} — tanpa 'GOSTAY' (Nexus yang menambahkannya)", () => {
    const ref = newNexusReference("lor-kali", new Date("2026-07-31T03:00:00Z"));
    expect(ref).toMatch(/^LORKALI-20260731-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(ref).toMatch(/^[A-Z0-9-]+$/);
    expect(ref.length).toBeLessThanOrEqual(64);
    // external_id di provider menjadi GOSTAY-LORKALI-… — persis satu kata GOSTAY.
    expect(`GOSTAY-${ref}`).not.toContain("GOSTAY-GOSTAY");
  });
});

// ─── Verifikasi signature (kontrak §6) ───────────────────────────────────────
describe("verifyNexusSignature", () => {
  const raw = '{"event_id":"evt_1","data":{"reference":"R"}}';
  const now = 1_800_000_000;

  function sig(secret: string, ts: number = now, body: string = raw): string {
    return `sha256=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;
  }

  it("mengembalikan environment yang SECRET-nya cocok — bukan yang diaku header", () => {
    expect(verifyNexusSignature(raw, String(now), sig(SANDBOX_SECRET), now)).toBe("sandbox");
    expect(verifyNexusSignature(raw, String(now), sig(PROD_SECRET), now)).toBe("production");
  });

  it("menolak signature dari secret yang salah", () => {
    expect(verifyNexusSignature(raw, String(now), sig("secret-lain"), now)).toBeNull();
  });

  it("menolak body yang diubah satu byte pun", () => {
    expect(verifyNexusSignature(raw.replace("R", "S"), String(now), sig(SANDBOX_SECRET), now)).toBeNull();
  });

  it("menolak timestamp basi (> 5 menit) — jendela replay tertutup", () => {
    const stale = now - 301;
    expect(verifyNexusSignature(raw, String(stale), sig(SANDBOX_SECRET, stale), now)).toBeNull();
    const fresh = now - 299;
    expect(verifyNexusSignature(raw, String(fresh), sig(SANDBOX_SECRET, fresh), now)).toBe("sandbox");
  });

  it("gagal-tertutup pada header hilang/aneh", () => {
    expect(verifyNexusSignature(raw, undefined, sig(SANDBOX_SECRET), now)).toBeNull();
    expect(verifyNexusSignature(raw, String(now), undefined, now)).toBeNull();
    expect(verifyNexusSignature(raw, "bukan-angka", sig(SANDBOX_SECRET), now)).toBeNull();
    expect(verifyNexusSignature(raw, String(now), "md5=abc", now)).toBeNull();
  });

  it("tidak memverifikasi environment yang secret-nya tidak dikonfigurasi", () => {
    delete process.env.NEXUS_SIGNING_SECRET_PRODUCTION;
    expect(verifyNexusSignature(raw, String(now), sig(PROD_SECRET), now)).toBeNull();
  });
});

// ─── HTTP ─────────────────────────────────────────────────────────────────────
describe("createNexusPayment", () => {
  it("mengirim body APA ADANYA dengan Idempotency-Key = reference", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "pi-1", reference: "REF", status: "pending", amount: 5, checkout_url: "https://c/1" }), { status: 201 });
    }) as unknown as typeof fetch;

    const body = '{"reference":"REF","amount":5}';
    const p = await createNexusPayment("sandbox", "REF", body, fakeFetch);

    expect(p).toMatchObject({ id: "pi-1", checkout_url: "https://c/1" });
    // Byte-per-byte: idempotensi Nexus terikat pada hash body.
    expect(calls[0].init.body).toBe(body);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("REF");
    expect(headers.Authorization).toBe("Bearer nxs_sandbox_abc");
    expect(calls[0].url).toContain("/payments");
  });

  it("memakai key PRODUCTION untuk environment production", async () => {
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      expect(h.Authorization).toBe("Bearer nxs_live_abc");
      return new Response("{}", { status: 201 });
    }) as unknown as typeof fetch;
    await createNexusPayment("production", "R", "{}", fakeFetch);
  });

  it("melempar dengan pesan Nexus tersambung — 409 idempotency_key_reused tidak boleh hilang", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: { code: "idempotency_key_reused" } }), { status: 409 })
    ) as unknown as typeof fetch;
    await expect(createNexusPayment("sandbox", "R", "{}", fakeFetch))
      .rejects.toThrow(/409.*idempotency_key_reused/);
  });

  it("melempar nexus_not_configured saat key environment-nya kosong", async () => {
    delete process.env.NEXUS_API_KEY_SANDBOX;
    await expect(createNexusPayment("sandbox", "R", "{}", fetch)).rejects.toThrow("nexus_not_configured_sandbox");
    expect(isNexusConfigured("sandbox")).toBe(false);
    expect(isNexusConfigured("production")).toBe(true);
  });
});

describe("ensureNexusMerchant / listNexusPaymentsUpdatedSince", () => {
  it("mendaftarkan merchant dengan external_ref = tenant id", async () => {
    let sent: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response("{}", { status: 201 });
    }) as unknown as typeof fetch;
    await ensureNexusMerchant("sandbox", { tenantId: "tn-1", hotelSlug: "lor-kali", hotelName: "Lor Kali" }, fakeFetch);
    expect(sent).toEqual({ external_ref: "tn-1", code: "LORKALI", name: "Lor Kali" });
  });

  it("membaca daftar rekonsiliasi dari amplop { data: [...] }", async () => {
    const fakeFetch = (async (url: string) => {
      expect(url).toContain("updated_since=2026-07-31T00%3A00%3A00.000Z");
      expect(url).toContain("limit=200");
      return new Response(JSON.stringify({ data: [{ id: "pi-1", reference: "R", status: "paid", amount: 5, amount_paid: 5 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const rows = await listNexusPaymentsUpdatedSince("sandbox", "2026-07-31T00:00:00.000Z", 200, fakeFetch);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "pi-1", status: "paid" });
  });
});
