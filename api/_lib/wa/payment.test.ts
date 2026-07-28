// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const { handlers, client } = vi.hoisted(() => ({
  handlers: { handleCreateInvoice: vi.fn() },
  client: { serviceGet: vi.fn() },
}));
vi.mock("../payment/handlers", () => handlers);
vi.mock("./client", () => client);
// service.ts is imported only for the re-export; keep it inert.
vi.mock("../payment/service", () => ({ getHotelPaymentMode: vi.fn() }));

import { paymentInstruction } from "./payment";

/** Stand in for the hotel_payment_config read. */
function paymentConfig(rows: Array<{ is_active?: boolean }> | null) {
  client.serviceGet.mockResolvedValue(
    rows === null
      ? ({ ok: false, status: 500 } as Response)
      : ({ ok: true, json: async () => rows } as unknown as Response),
  );
}

const base = { tenantId: "tenant-x", bookingReference: "BK-1", total: 950_000, brand: "Hotel Uji" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("paymentInstruction — hotels not on online payment", () => {
  it("tells the guest to settle at the front desk when the hotel is switched off", async () => {
    paymentConfig([{ is_active: false }]);

    const r = await paymentInstruction(base);

    expect(r.hasLink).toBe(false);
    expect(r.text).toContain("950.000");
    expect(r.text).toContain("langsung di *Hotel Uji* saat check-in");
    expect(handlers.handleCreateInvoice).not.toHaveBeenCalled();
  });

  it("fails closed when the hotel has never been switched on", async () => {
    // No row at all — a hotel nobody has enabled must not be charged online.
    paymentConfig([]);

    const r = await paymentInstruction(base);

    expect(r.hasLink).toBe(false);
    expect(r.text).toContain("saat check-in");
    expect(handlers.handleCreateInvoice).not.toHaveBeenCalled();
  });

  it("fails closed when the config read errors", async () => {
    paymentConfig(null);
    const r = await paymentInstruction(base);
    expect(r.hasLink).toBe(false);
    expect(handlers.handleCreateInvoice).not.toHaveBeenCalled();
  });

  it("skips the gateway entirely without a booking reference", async () => {
    paymentConfig([{ is_active: true }]);
    const r = await paymentInstruction({ ...base, bookingReference: null });
    expect(r.hasLink).toBe(false);
    expect(handlers.handleCreateInvoice).not.toHaveBeenCalled();
  });
});

describe("paymentInstruction — the link", () => {
  beforeEach(() => paymentConfig([{ is_active: true }]));

  it("sends the invoice URL and the amount the gateway actually billed", async () => {
    handlers.handleCreateInvoice.mockResolvedValue({
      ok: true, invoiceUrl: "https://pay.example/inv_9", invoiceId: "inv_9",
      amount: 900_000, mode: "live",
    });

    const r = await paymentInstruction(base);

    expect(r.hasLink).toBe(true);
    expect(r.text).toContain("https://pay.example/inv_9");
    // The gateway's amount wins over our total — it knows about part-payments.
    expect(r.text).toContain("900.000");
    expect(r.text).not.toContain("uji coba");
    expect(handlers.handleCreateInvoice).toHaveBeenCalledWith({ bookingReference: "BK-1" });
  });

  it("labels a test-mode invoice so a sandbox payment is not mistaken for real", async () => {
    handlers.handleCreateInvoice.mockResolvedValue({
      ok: true, invoiceUrl: "https://pay.example/inv_t", amount: 950_000, mode: "test",
    });

    const r = await paymentInstruction(base);

    expect(r.hasLink).toBe(true);
    expect(r.text).toContain("mode uji coba");
  });
});

describe("paymentInstruction — never breaks a confirmed booking", () => {
  beforeEach(() => paymentConfig([{ is_active: true }]));

  it("promises a follow-up when the gateway refuses", async () => {
    handlers.handleCreateInvoice.mockResolvedValue({ ok: false, status: 502, error: "gateway_down" });

    const r = await paymentInstruction(base);

    expect(r.hasLink).toBe(false);
    // NOT the front-desk wording: this hotel does take payment online, so
    // sending them to reception would be wrong.
    expect(r.text).not.toContain("saat check-in");
    expect(r.text).toContain("Tim kami akan mengirimkan instruksi pembayaran");
    expect(r.text).toContain("950.000");
  });

  it("promises a follow-up when the gateway answers without a URL", async () => {
    handlers.handleCreateInvoice.mockResolvedValue({ ok: true, invoiceUrl: "", amount: 950_000, mode: "live" });
    const r = await paymentInstruction(base);
    expect(r.hasLink).toBe(false);
    expect(r.text).toContain("Tim kami akan mengirimkan");
  });

  it("does not throw when the gateway call itself throws", async () => {
    // The reservation already exists; an exception here would tell the guest
    // their booking failed when it did not.
    handlers.handleCreateInvoice.mockRejectedValue(new Error("socket hang up"));

    const r = await paymentInstruction(base);

    expect(r.hasLink).toBe(false);
    expect(r.text).toContain("Tim kami akan mengirimkan");
  });
});
