// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// handlers.ts orchestrates the payment leaves. We mock the two that touch the
// outside world — ./service (DB over PostgREST) and ./gateway (HTTP to Ventera)
// — and keep ./xendit and ./token real, because they are pure and their mapping
// (env⇄mode, status normalisation, constant-time token match) is exactly what
// these flows must get right. So this file tests the STATE MACHINE:
//   create-invoice: which amount, which env, what the gateway is asked for.
//   webhook:        auth, which statuses act, how the payment is stamped.

const { service, gateway } = vi.hoisted(() => ({
  service: {
    getHotelPaymentMode: vi.fn(),
    getBookingByReference: vi.fn(),
    recordGatewayPayment: vi.fn(),
  },
  gateway: { createInvoiceViaGateway: vi.fn() },
}));

vi.mock("./service", () => service);
vi.mock("./gateway", () => gateway);

import {
  handleCreateInvoice,
  handleWebhook,
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
};

beforeEach(() => {
  vi.clearAllMocks();
  service.getHotelPaymentMode.mockResolvedValue("test");
  service.getBookingByReference.mockResolvedValue(booking);
  service.recordGatewayPayment.mockResolvedValue("recorded");
  gateway.createInvoiceViaGateway.mockImplementation(async (input: any, env: string) => ({
    id: "inv_1",
    invoiceUrl: "https://pay/inv_1",
    status: "PENDING",
    amount: input.amount,
    externalId: input.externalId,
  }));
  // Both env tokens configured, distinct — matchGatewayToken (real) picks by value.
  process.env.INTERNAL_TOKEN_PRODUCTION = "prod-token";
  process.env.INTERNAL_TOKEN_SANDBOX = "sandbox-token";
});

// ─── external_id ⇄ reference (the GOSTAY report key) ─────────────────────────
describe("externalIdFor / referenceFromExternalId", () => {
  it("prefixes every invoice with GOSTAY- so cross-project reports can attribute it", () => {
    // The whole point of the prefix: an invoice in a shared gateway ledger must
    // be recognisably GoStay's without any extra lookup.
    expect(externalIdFor("BK-1001")).toBe("GOSTAY-BK-1001");
    expect(externalIdFor("BK-1001").startsWith("GOSTAY-")).toBe(true);
  });

  it("round-trips reference → external_id → reference", () => {
    expect(referenceFromExternalId(externalIdFor("BK-42"))).toBe("BK-42");
  });

  it("recovers the reference even after a -R<n> retry suffix", () => {
    expect(referenceFromExternalId("GOSTAY-BK-1001-R2")).toBe("BK-1001");
  });
});

// ─── Create invoice ──────────────────────────────────────────────────────────
describe("handleCreateInvoice", () => {
  it("defaults the amount to the booking's outstanding balance", async () => {
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toMatchObject({ ok: true, amount: 750_000 }); // 1,000,000 − 250,000
    expect(gateway.createInvoiceViaGateway).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 750_000 }),
      "sandbox",
      expect.anything(),
    );
  });

  it("honours an explicit amount (e.g. a deposit) over the outstanding balance", async () => {
    const res = await handleCreateInvoice({ bookingReference: "BK-1001", amount: 300_000 });
    expect(res).toMatchObject({ ok: true, amount: 300_000 });
  });

  it("asks the gateway for a GOSTAY-prefixed external_id", async () => {
    await handleCreateInvoice({ bookingReference: "BK-1001" });
    const [input] = gateway.createInvoiceViaGateway.mock.calls[0];
    expect(input.externalId).toBe("GOSTAY-BK-1001");
    expect(input.externalId.startsWith("GOSTAY-")).toBe(true);
  });

  it("uses the SANDBOX environment for a test-mode hotel", async () => {
    service.getHotelPaymentMode.mockResolvedValue("test");
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toMatchObject({ ok: true, mode: "test" });
    expect(gateway.createInvoiceViaGateway).toHaveBeenCalledWith(
      expect.anything(), "sandbox", expect.anything(),
    );
  });

  it("uses the PRODUCTION environment for a live-mode hotel", async () => {
    service.getHotelPaymentMode.mockResolvedValue("live");
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toMatchObject({ ok: true, mode: "live" });
    expect(gateway.createInvoiceViaGateway).toHaveBeenCalledWith(
      expect.anything(), "production", expect.anything(),
    );
  });

  it("passes the payer email and success redirect through to the gateway", async () => {
    await handleCreateInvoice({ bookingReference: "BK-1001", successRedirectUrl: "https://gostay.id/ok" });
    const [input] = gateway.createInvoiceViaGateway.mock.calls[0];
    expect(input.payerEmail).toBe("guest@hotel.com");
    expect(input.successRedirectUrl).toBe("https://gostay.id/ok");
  });

  it("404s when the booking reference is unknown", async () => {
    service.getBookingByReference.mockResolvedValue(null);
    const res = await handleCreateInvoice({ bookingReference: "NOPE" });
    expect(res).toEqual({ ok: false, status: 404, error: "booking_not_found" });
    expect(gateway.createInvoiceViaGateway).not.toHaveBeenCalled();
  });

  it("400s (nothing_to_pay) when the booking is already fully paid", async () => {
    service.getBookingByReference.mockResolvedValue({ ...booking, amount_paid: booking.total_amount });
    const res = await handleCreateInvoice({ bookingReference: "BK-1001" });
    expect(res).toEqual({ ok: false, status: 400, error: "nothing_to_pay" });
    expect(gateway.createInvoiceViaGateway).not.toHaveBeenCalled();
  });

  it("400s when an explicit amount is zero or negative", async () => {
    const res = await handleCreateInvoice({ bookingReference: "BK-1001", amount: 0 });
    expect(res).toEqual({ ok: false, status: 400, error: "nothing_to_pay" });
  });
});

// ─── Webhook settlement ──────────────────────────────────────────────────────
describe("handleWebhook", () => {
  const paidBody = { external_id: "GOSTAY-BK-1001", invoice_id: "inv_1", status: "PAID", amount: 750_000 };

  it("401s when the internal token matches neither environment", async () => {
    const res = await handleWebhook("wrong-token", paidBody);
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" });
    expect(service.recordGatewayPayment).not.toHaveBeenCalled();
  });

  it("401s when no token header is present at all", async () => {
    const res = await handleWebhook(undefined, paidBody);
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" });
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

  it("surfaces the idempotent duplicate outcome from the service layer", async () => {
    service.recordGatewayPayment.mockResolvedValue("duplicate");
    const res = await handleWebhook("sandbox-token", paidBody);
    expect(res).toEqual({ ok: true, outcome: "duplicate", status: 200 });
  });

  it("400s on a malformed payload (missing invoice id or non-positive amount)", async () => {
    expect(await handleWebhook("sandbox-token", { external_id: "GOSTAY-BK-1001", status: "PAID", amount: 750_000 }))
      .toEqual({ ok: false, status: 400, error: "malformed_webhook" });
    expect(await handleWebhook("sandbox-token", { ...paidBody, amount: 0 }))
      .toEqual({ ok: false, status: 400, error: "malformed_webhook" });
    expect(service.recordGatewayPayment).not.toHaveBeenCalled();
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

  it("falls back to `id`/`paid_amount` when the gateway omits invoice_id/amount", async () => {
    const res = await handleWebhook("sandbox-token", {
      external_id: "GOSTAY-BK-1001", id: "inv_alt", status: "PAID", paid_amount: 500_000,
    });
    expect(res).toEqual({ ok: true, outcome: "recorded", status: 200 });
    expect(service.recordGatewayPayment).toHaveBeenCalledWith(
      expect.objectContaining({ gatewayRef: "inv_alt", amount: 500_000 }),
    );
  });
});
