// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

// handlers.ts orchestrates the payment leaves. We mock the two that touch the
// outside world — ./service (DB over PostgREST) and the HTTP calls in ./nexus —
// and keep ./xendit, ./token, and the PURE parts of ./nexus real (reference
// format, signature verification), because their mapping is exactly what these
// flows must get right. So this file tests the STATE MACHINE:
//   create-invoice:  which amount, which env, reuse-vs-mint, what Nexus is asked.
//   nexus callback:  signature → env, idempotency, never-regress, how payment is stamped.
//   webhook (LEGACY): auth, which statuses act — invoice pra-migrasi masih lewat sini.
//   reconcile:       same apply function as the callback, cursor semantics.

const { service, nexusHttp, adminHttp } = vi.hoisted(() => ({
  service: {
    getHotelPaymentMode: vi.fn(),
    getBookingByReference: vi.fn(),
    recordGatewayPayment: vi.fn(),
    getNexusReference: vi.fn(),
    getOpenNexusReference: vi.fn(),
    insertNexusReference: vi.fn(),
    updateNexusReference: vi.fn(),
    markNexusEventProcessed: vi.fn(),
    getNexusReconcileCursor: vi.fn(),
    setNexusReconcileCursor: vi.fn(),
  },
  nexusHttp: {
    ensureNexusMerchant: vi.fn(),
    createNexusPayment: vi.fn(),
    listNexusPaymentsUpdatedSince: vi.fn(),
    syncNexusPayment: vi.fn(),
  },
  adminHttp: { serviceDelete: vi.fn() },
}));

vi.mock("./service", () => service);
vi.mock("../admin/http", () => adminHttp);
// Bagian murni ./nexus (reference, verifikasi signature, isNexusConfigured)
// tetap ASLI — hanya pemanggil HTTP-nya yang di-mock.
vi.mock("./nexus", async (importOriginal) => {
  const real = await importOriginal<typeof import("./nexus")>();
  return { ...real, ...nexusHttp };
});

import {
  handleCreateInvoice,
  handleWebhook,
  handleNexusCallback,
  handleReconcile,
  applyNexusPaymentStatus,
  externalIdFor,
  referenceFromExternalId,
} from "./handlers";

const booking = {
  id: "bk-1",
  tenant_id: "tn-1",
  reference: "BK-1001",
  total_amount: 1_000_000,
  amount_paid: 250_000,
  customer_email: "guest@hotel.com",
  hotel_slug: "lor-kali",
  hotel_name: "Lor Kali",
};

const refRow = {
  reference: "GOSTAY-LOR-KALI-20260731-ABCD2345",
  booking_id: "bk-1",
  tenant_id: "tn-1",
  environment: "sandbox" as const,
  amount: 750_000,
  request_body: '{"reference":"GOSTAY-LOR-KALI-20260731-ABCD2345","amount":750000}',
  nexus_payment_id: null,
  checkout_url: null,
  status: "pending",
};

const SANDBOX_SECRET = "sekrit-sandbox";
const PROD_SECRET = "sekrit-production";

/** Callback bertanda tangan persis seperti nexus-dispatch membuatnya. */
function signed(payload: Record<string, unknown>, secret: string, ts = Math.floor(Date.now() / 1000)) {
  const rawBody = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex")}`;
  return { rawBody, timestamp: String(ts), signature };
}

function paidEvent(overrides: Record<string, unknown> = {}) {
  const base = {
    event_id: "evt_abc123",
    event_type: "payment.paid",
    occurred_at: "2026-07-31T04:00:00.000Z",
    environment: "sandbox",
    data: {
      id: "pi-9",
      reference: refRow.reference,
      status: "paid",
      amount: 750_000,
      amount_paid: 750_000,
    },
  };
  return {
    ...base,
    ...overrides,
    data: { ...base.data, ...((overrides.data as Record<string, unknown>) ?? {}) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  service.getHotelPaymentMode.mockResolvedValue("test");
  service.getBookingByReference.mockResolvedValue(booking);
  service.recordGatewayPayment.mockResolvedValue("recorded");
  service.getNexusReference.mockResolvedValue(refRow);
  service.getOpenNexusReference.mockResolvedValue(null);
  service.insertNexusReference.mockResolvedValue(undefined);
  service.updateNexusReference.mockResolvedValue(undefined);
  service.markNexusEventProcessed.mockResolvedValue(true);
  service.getNexusReconcileCursor.mockResolvedValue(null);
  service.setNexusReconcileCursor.mockResolvedValue(undefined);
  nexusHttp.ensureNexusMerchant.mockResolvedValue(undefined);
  nexusHttp.createNexusPayment.mockImplementation(async (_env: string, _ref: string, body: string) => {
    const parsed = JSON.parse(body);
    return {
      id: "pi-1",
      reference: parsed.reference,
      status: "pending",
      amount: parsed.amount,
      amount_paid: 0,
      checkout_url: "https://checkout/pi-1",
      payment_method: null,
      payment_channel: null,
      environment: "sandbox",
      paid_at: null,
      updated_at: "2026-07-31T04:00:00.000Z",
    };
  });
  nexusHttp.listNexusPaymentsUpdatedSince.mockResolvedValue([]);
  // Both env tokens configured, distinct — matchGatewayToken (real) picks by value.
  process.env.INTERNAL_TOKEN_PRODUCTION = "prod-token";
  process.env.INTERNAL_TOKEN_SANDBOX = "sandbox-token";
  // Nexus dikonfigurasi untuk kedua environment; verifikasi signature (real)
  // membaca dua secret ini.
  process.env.NEXUS_API_KEY_SANDBOX = "nxs_sandbox_test_key";
  process.env.NEXUS_API_KEY_PRODUCTION = "nxs_live_test_key";
  process.env.NEXUS_SIGNING_SECRET_SANDBOX = SANDBOX_SECRET;
  process.env.NEXUS_SIGNING_SECRET_PRODUCTION = PROD_SECRET;
});

// ─── external_id ⇄ reference (kunci pelaporan jalur LAMA) ────────────────────
describe("externalIdFor / referenceFromExternalId", () => {
  it("prefixes every invoice with GOSTAY- so cross-project reports can attribute it", () => {
    expect(externalIdFor("BK-1001")).toBe("GOSTAY-BK-1001");
    expect(externalIdFor("BK-1001", "lor-kali").startsWith("GOSTAY-")).toBe(true);
  });

  it("names the hotel, so one Xendit ledger serving many hotels stays readable", () => {
    expect(externalIdFor("BK-20260730-D39D", "lor-kali")).toBe("GOSTAY-LOR-KALI-BK-20260730-D39D");
  });

  it("round-trips reference → external_id → reference", () => {
    expect(referenceFromExternalId(externalIdFor("BK-42"))).toBe("BK-42");
    expect(referenceFromExternalId(externalIdFor("BK-20260730-D39D", "lor-kali")))
      .toBe("BK-20260730-D39D");
  });

  it("still reads invoices minted BEFORE the hotel segment existed", () => {
    expect(referenceFromExternalId("GOSTAY-BK-20260728-F77A")).toBe("BK-20260728-F77A");
  });

  it("recovers the reference even after a -R<n> retry suffix", () => {
    expect(referenceFromExternalId("GOSTAY-LOR-KALI-BK-20260730-D39D-R2"))
      .toBe("BK-20260730-D39D");
  });
});

// ─── Create invoice (via Nexus) ──────────────────────────────────────────────
describe("handleCreateInvoice", () => {
  it("defaults the amount to the booking's outstanding balance", async () => {
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toMatchObject({ ok: true, amount: 750_000 }); // 1,000,000 − 250,000
    const [, , body] = nexusHttp.createNexusPayment.mock.calls[0];
    expect(JSON.parse(body).amount).toBe(750_000);
  });

  it("mints a contract-shaped reference: GOSTAY-{MERCHANT}-{YYYYMMDD}-{ACAK}", async () => {
    await handleCreateInvoice({ bookingReference: "BK-1001" });
    const [, reference, body] = nexusHttp.createNexusPayment.mock.calls[0];
    // Crockford Base32: tanpa I, L, O, U. Jenis transaksi TIDAK dikodekan.
    expect(reference).toMatch(/^GOSTAY-LOR-KALI-\d{8}-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(JSON.parse(body).reference).toBe(reference);
  });

  it("uses the SANDBOX environment for a test-mode hotel and PRODUCTION for live", async () => {
    service.getHotelPaymentMode.mockResolvedValue("test");
    expect(await handleCreateInvoice({ bookingReference: "BK-1001" })).toMatchObject({ mode: "test" });
    expect(nexusHttp.createNexusPayment.mock.calls[0][0]).toBe("sandbox");

    service.getHotelPaymentMode.mockResolvedValue("live");
    expect(await handleCreateInvoice({ bookingReference: "BK-1001" })).toMatchObject({ mode: "live" });
    expect(nexusHttp.createNexusPayment.mock.calls[1][0]).toBe("production");
  });

  it("passes the guest email, redirect, and booking reference (as metadata) through", async () => {
    await handleCreateInvoice({ bookingReference: "BK-1001", successRedirectUrl: "https://gostay.id/ok" });
    const body = JSON.parse(nexusHttp.createNexusPayment.mock.calls[0][2]);
    expect(body.customer).toEqual({ email: "guest@hotel.com" });
    expect(body.success_redirect_url).toBe("https://gostay.id/ok");
    expect(body.metadata).toEqual({ booking_reference: "BK-1001" });
    expect(body.merchant_ref).toBe("tn-1");
  });

  it("registers the hotel as a Nexus merchant before minting (idempotent upsert)", async () => {
    await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(nexusHttp.ensureNexusMerchant).toHaveBeenCalledWith(
      "sandbox",
      { tenantId: "tn-1", hotelSlug: "lor-kali", hotelName: "Lor Kali" },
      expect.anything(),
    );
  });

  it("still mints (without merchant_ref) when merchant registration fails — the guest is waiting", async () => {
    nexusHttp.ensureNexusMerchant.mockRejectedValue(new Error("nexus down"));
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toMatchObject({ ok: true });
    const body = JSON.parse(nexusHttp.createNexusPayment.mock.calls[0][2]);
    expect(body.merchant_ref).toBeUndefined();
  });

  it("writes the reference mapping BEFORE calling Nexus (crash-safe resume point)", async () => {
    const order: string[] = [];
    service.insertNexusReference.mockImplementation(async () => { order.push("insert"); });
    nexusHttp.createNexusPayment.mockImplementation(async (_e: string, ref: string, body: string) => {
      order.push("nexus");
      return {
        id: "pi-1", reference: ref, status: "pending", amount: JSON.parse(body).amount,
        amount_paid: 0, checkout_url: "https://checkout/pi-1", payment_method: null,
        payment_channel: null, environment: "sandbox", paid_at: null, updated_at: null,
      };
    });
    await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(order).toEqual(["insert", "nexus"]);
  });

  it("REUSES an open Nexus payment instead of minting a second one", async () => {
    service.getOpenNexusReference.mockResolvedValue({
      ...refRow,
      nexus_payment_id: "pi-7",
      checkout_url: "https://checkout/pi-7",
    });
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toMatchObject({ ok: true, invoiceUrl: "https://checkout/pi-7", invoiceId: "pi-7" });
    expect(nexusHttp.createNexusPayment).not.toHaveBeenCalled();
    expect(service.insertNexusReference).not.toHaveBeenCalled();
  });

  it("resumes a half-created payment by re-sending the STORED body with the SAME reference", async () => {
    // Baris pemetaan ada tapi checkout_url kosong: proses mati di antara insert
    // dan POST. Idempotency-Key Nexus terikat hash body — string tersimpan yang
    // harus dikirim ulang, bukan body yang disusun ulang.
    service.getOpenNexusReference.mockResolvedValue({ ...refRow, status: "created" });
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toMatchObject({ ok: true });
    expect(nexusHttp.createNexusPayment).toHaveBeenCalledWith(
      "sandbox", refRow.reference, refRow.request_body, expect.anything(),
    );
    expect(service.insertNexusReference).not.toHaveBeenCalled();
  });

  it("404s when the booking reference is unknown", async () => {
    service.getBookingByReference.mockResolvedValue(null);
    const res = await handleCreateInvoice({ bookingReference: "NOPE" });
    expect(res).toEqual({ ok: false, status: 404, error: "booking_not_found" });
    expect(nexusHttp.createNexusPayment).not.toHaveBeenCalled();
  });

  it("400s (nothing_to_pay) when the booking is already fully paid", async () => {
    service.getBookingByReference.mockResolvedValue({ ...booking, amount_paid: booking.total_amount });
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toEqual({ ok: false, status: 400, error: "nothing_to_pay" });
  });

  it("503s when Nexus is not configured for the hotel's environment", async () => {
    delete process.env.NEXUS_API_KEY_SANDBOX;
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toEqual({ ok: false, status: 503, error: "nexus_not_configured_sandbox" });
  });
});

// ─── Callback Nexus ──────────────────────────────────────────────────────────
describe("handleNexusCallback", () => {
  it("verifies the signature, then records a paid settlement stamped by the SECRET's env", async () => {
    const res = await handleNexusCallback(signed(paidEvent(), SANDBOX_SECRET));
    expect(res).toEqual({ ok: true, outcome: "recorded", status: 200 });
    expect(service.recordGatewayPayment).toHaveBeenCalledWith({
      tenantId: "tn-1", bookingId: "bk-1", amount: 750_000,
      gatewayRef: "pi-9", mode: "test", gateway: "nexus",
    });
    expect(service.updateNexusReference).toHaveBeenCalledWith(
      refRow.reference, expect.objectContaining({ status: "paid" }),
    );
  });

  it("stamps LIVE when the PRODUCTION secret matched — the header is not trusted", async () => {
    // Payload mengaku sandbox; yang menentukan adalah secret yang cocok.
    await handleNexusCallback(signed(paidEvent({ environment: "sandbox" }), PROD_SECRET));
    expect(service.recordGatewayPayment).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "live" }),
    );
  });

  it("401s an invalid signature without touching the database", async () => {
    const { rawBody, timestamp } = signed(paidEvent(), SANDBOX_SECRET);
    const res = await handleNexusCallback({
      rawBody, timestamp, signature: "sha256=" + "0".repeat(64),
    });
    expect(res).toEqual({ ok: false, status: 401, error: "invalid_signature" });
    expect(service.markNexusEventProcessed).not.toHaveBeenCalled();
    expect(service.recordGatewayPayment).not.toHaveBeenCalled();
  });

  it("401s a stale timestamp (replay window is 5 minutes)", async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const res = await handleNexusCallback(signed(paidEvent(), SANDBOX_SECRET, stale));
    expect(res).toEqual({ ok: false, status: 401, error: "invalid_signature" });
  });

  it("answers 200/duplicate for an event id it has already processed", async () => {
    service.markNexusEventProcessed.mockResolvedValue(false);
    const res = await handleNexusCallback(signed(paidEvent(), SANDBOX_SECRET));
    expect(res).toEqual({ ok: true, outcome: "duplicate", status: 200 });
    expect(service.recordGatewayPayment).not.toHaveBeenCalled();
  });

  it("answers 2xx for an unknown event type — never a retry storm", async () => {
    const res = await handleNexusCallback(
      signed(paidEvent({ event_type: "shipment.created" }), SANDBOX_SECRET),
    );
    expect(res).toEqual({ ok: true, outcome: "ignored", status: 200 });
    expect(service.recordGatewayPayment).not.toHaveBeenCalled();
  });

  it("answers 2xx (and logs) for a reference it has no mapping for", async () => {
    service.getNexusReference.mockResolvedValue(null);
    const res = await handleNexusCallback(signed(paidEvent(), SANDBOX_SECRET));
    expect(res).toEqual({ ok: true, outcome: "ignored", status: 200 });
  });

  it("releases the event marker when processing fails, so the retry is not answered 'duplicate'", async () => {
    service.recordGatewayPayment.mockRejectedValue(new Error("db down"));
    const res = await handleNexusCallback(signed(paidEvent(), SANDBOX_SECRET));
    expect(res).toEqual({ ok: false, status: 500, error: "processing_failed" });
    expect(adminHttp.serviceDelete).toHaveBeenCalledWith(
      "nexus_processed_events?event_id=eq.evt_abc123",
    );
  });
});

// ─── Never regress + shared apply ────────────────────────────────────────────
describe("applyNexusPaymentStatus", () => {
  it("never regresses paid → pending (out-of-order events)", async () => {
    const outcome = await applyNexusPaymentStatus(
      { ...refRow, status: "paid" },
      { id: "pi-9", status: "pending", amount_paid: 0 },
      "sandbox",
    );
    expect(outcome).toBe("skipped");
    expect(service.recordGatewayPayment).not.toHaveBeenCalled();
    expect(service.updateNexusReference).not.toHaveBeenCalled();
  });

  it("records money exactly once — duplicate gateway_ref surfaces as 'duplicate'", async () => {
    service.recordGatewayPayment.mockResolvedValue("duplicate");
    const outcome = await applyNexusPaymentStatus(
      refRow, { id: "pi-9", status: "paid", amount_paid: 750_000 }, "sandbox",
    );
    expect(outcome).toBe("duplicate");
  });

  it("tracks non-money statuses (expired) on the mapping without recording a payment", async () => {
    const outcome = await applyNexusPaymentStatus(
      refRow, { id: "pi-9", status: "expired", amount_paid: 0 }, "sandbox",
    );
    expect(outcome).toBe("updated");
    expect(service.recordGatewayPayment).not.toHaveBeenCalled();
    expect(service.updateNexusReference).toHaveBeenCalledWith(
      refRow.reference, expect.objectContaining({ status: "expired" }),
    );
  });
});

// ─── Rekonsiliasi ────────────────────────────────────────────────────────────
describe("handleReconcile", () => {
  it("pulls updated payments and applies them through the SAME function as the callback", async () => {
    delete process.env.NEXUS_API_KEY_PRODUCTION; // sandbox saja di test ini
    nexusHttp.listNexusPaymentsUpdatedSince.mockResolvedValue([
      {
        id: "pi-9", reference: refRow.reference, status: "paid", amount: 750_000,
        amount_paid: 750_000, checkout_url: null, payment_method: "BANK_TRANSFER",
        payment_channel: "BCA", environment: "sandbox", paid_at: "2026-07-31T04:10:00Z",
        updated_at: "2026-07-31T04:10:01Z",
      },
      { // pembayaran yang bukan milik pemetaan mana pun — dilewati
        id: "pi-x", reference: "SELLIX-TESTING-20260731-XXXXXXXX", status: "paid",
        amount: 1, amount_paid: 1, checkout_url: null, payment_method: null,
        payment_channel: null, environment: "sandbox", paid_at: null, updated_at: null,
      },
    ]);
    service.getNexusReference.mockImplementation(async (ref: string) =>
      ref === refRow.reference ? refRow : null,
    );

    const results = await handleReconcile();
    expect(results).toEqual([
      { environment: "sandbox", scanned: 2, recorded: 1, updated: 0 },
    ]);
    expect(service.recordGatewayPayment).toHaveBeenCalledWith(
      expect.objectContaining({ gateway: "nexus", gatewayRef: "pi-9", mode: "test" }),
    );
    // Kursor disimpan hanya setelah seluruh halaman selesai.
    expect(service.setNexusReconcileCursor).toHaveBeenCalledWith("sandbox", expect.any(String));
  });

  it("overlaps the cursor by 5 minutes to absorb clock skew", async () => {
    delete process.env.NEXUS_API_KEY_PRODUCTION;
    service.getNexusReconcileCursor.mockResolvedValue("2026-07-31T04:00:00.000Z");
    await handleReconcile();
    const [, since] = nexusHttp.listNexusPaymentsUpdatedSince.mock.calls[0];
    expect(since).toBe("2026-07-31T03:55:00.000Z");
  });
});

// ─── Webhook settlement (jalur LAMA — invoice pra-migrasi) ───────────────────
describe("handleWebhook", () => {
  const paidBody = { external_id: "GOSTAY-BK-1001", invoice_id: "inv_1", status: "PAID", amount: 750_000 };

  it("401s when the internal token matches neither environment", async () => {
    const res = await handleWebhook("wrong-token", paidBody);
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" });
    expect(service.recordGatewayPayment).not.toHaveBeenCalled();
  });

  it("records a paid settlement and stamps it TEST for the sandbox token", async () => {
    const res = await handleWebhook("sandbox-token", paidBody);
    expect(res).toEqual({ ok: true, outcome: "recorded", status: 200 });
    expect(service.recordGatewayPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tn-1", bookingId: "bk-1", amount: 750_000, gatewayRef: "inv_1", mode: "test",
      }),
    );
  });

  it("stamps a settlement LIVE for the production token", async () => {
    await handleWebhook("prod-token", paidBody);
    expect(service.recordGatewayPayment).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "live" }),
    );
  });

  it("treats SETTLED like PAID", async () => {
    const res = await handleWebhook("sandbox-token", { ...paidBody, status: "SETTLED" });
    expect(res).toEqual({ ok: true, outcome: "recorded", status: 200 });
  });

  it("acknowledges and ignores a non-paid status (EXPIRED/PENDING) without recording", async () => {
    for (const status of ["EXPIRED", "PENDING", "FAILED", undefined]) {
      const res = await handleWebhook("sandbox-token", { ...paidBody, status });
      expect(res).toEqual({ ok: true, outcome: "ignored", status: 200 });
    }
    expect(service.recordGatewayPayment).not.toHaveBeenCalled();
  });

  it("400s on a malformed payload (missing invoice id or non-positive amount)", async () => {
    expect(await handleWebhook("sandbox-token", { external_id: "GOSTAY-BK-1001", status: "PAID", amount: 750_000 }))
      .toEqual({ ok: false, status: 400, error: "malformed_webhook" });
    expect(await handleWebhook("sandbox-token", { ...paidBody, amount: 0 }))
      .toEqual({ ok: false, status: 400, error: "malformed_webhook" });
  });

  it("404s when the settled external_id maps to no known booking", async () => {
    service.getBookingByReference.mockResolvedValue(null);
    const res = await handleWebhook("sandbox-token", paidBody);
    expect(res).toEqual({ ok: false, status: 404, error: "booking_not_found" });
  });

  it("strips the GOSTAY- prefix (and -R<n> retry suffix) before the booking lookup", async () => {
    await handleWebhook("sandbox-token", { ...paidBody, external_id: "GOSTAY-BK-1001-R3" });
    expect(service.getBookingByReference).toHaveBeenCalledWith("BK-1001");
  });
});
