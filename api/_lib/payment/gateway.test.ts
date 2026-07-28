// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createInvoiceViaGateway, isGatewayConfigured, xenditKey } from "./gateway";

describe("createInvoiceViaGateway", () => {
  beforeEach(() => {
    process.env.XENDIT_API_KEY_SANDBOX = "xnd_development_test";
    process.env.XENDIT_API_KEY_PRODUCTION = "xnd_production_test";
    process.env.XENDIT_API_URL = "https://fake.local/v2/invoices";
  });
  afterEach(() => {
    delete process.env.XENDIT_API_KEY_SANDBOX;
    delete process.env.XENDIT_API_KEY_PRODUCTION;
    delete process.env.XENDIT_API_URL;
  });

  it("posts the invoice to Xendit with Basic auth", async () => {
    // The previous version aimed this at the Ventera gateway, which has no
    // invoice endpoint — every booking fell back to "belum dapat kami buat".
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return { ok: true, status: 200, json: async () => ({
        id: "inv_9", invoice_url: "https://pay/inv_9", status: "PENDING",
        amount: 950000, external_id: "GOSTAY-BK-1",
      }) } as Response;
    }) as unknown as typeof fetch;

    const inv = await createInvoiceViaGateway(
      { externalId: "GOSTAY-BK-1", amount: 950000, payerEmail: "g@h.com", description: "Pembayaran BK-1" },
      "sandbox", fakeFetch,
    );

    expect(inv.invoiceUrl).toBe("https://pay/inv_9");
    expect(inv.id).toBe("inv_9");
    expect(captured!.url).toBe("https://fake.local/v2/invoices");

    // Xendit uses HTTP Basic with the secret key as the username, empty password.
    const headers = captured!.init.headers as Record<string, string>;
    const decoded = Buffer.from(headers.Authorization.replace("Basic ", ""), "base64").toString();
    expect(decoded).toBe("xnd_development_test:");

    const body = JSON.parse(captured!.init.body as string);
    expect(body).toMatchObject({
      external_id: "GOSTAY-BK-1", amount: 950000, payer_email: "g@h.com", currency: "IDR",
    });
  });

  it("keeps the GOSTAY- prefix, which is how the callback finds its way home", async () => {
    // The gateway routes the return leg on this prefix. Lose it and the payment
    // settles at Xendit and is never recorded here.
    let body: Record<string, unknown> = {};
    const fakeFetch = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return { ok: true, status: 200, json: async () => ({ id: "i", invoice_url: "u" }) } as Response;
    }) as unknown as typeof fetch;

    await createInvoiceViaGateway({ externalId: "GOSTAY-BK-7", amount: 100 }, "sandbox", fakeFetch);

    expect(body.external_id).toBe("GOSTAY-BK-7");
  });

  it("uses the live key only in production", async () => {
    // Two separate variables rather than one key plus a flag, so a test hotel
    // physically cannot reach the live key.
    let auth = "";
    const fakeFetch = (async (_u: string, init: RequestInit) => {
      auth = Buffer.from(
        (init.headers as Record<string, string>).Authorization.replace("Basic ", ""), "base64",
      ).toString();
      return { ok: true, status: 200, json: async () => ({ id: "i", invoice_url: "u" }) } as Response;
    }) as unknown as typeof fetch;

    await createInvoiceViaGateway({ externalId: "GOSTAY-BK-2", amount: 100 }, "production", fakeFetch);
    expect(auth).toBe("xnd_production_test:");

    await createInvoiceViaGateway({ externalId: "GOSTAY-BK-3", amount: 100 }, "sandbox", fakeFetch);
    expect(auth).toBe("xnd_development_test:");
  });

  it("omits optional fields rather than sending nulls", async () => {
    let body: Record<string, unknown> = {};
    const fakeFetch = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return { ok: true, status: 200, json: async () => ({ id: "i", invoice_url: "u" }) } as Response;
    }) as unknown as typeof fetch;

    await createInvoiceViaGateway({ externalId: "x", amount: 1 }, "sandbox", fakeFetch);

    expect("payer_email" in body).toBe(false);
    expect("success_redirect_url" in body).toBe(false);
  });

  it("reports each environment's configuration independently", () => {
    expect(isGatewayConfigured("sandbox")).toBe(true);
    expect(isGatewayConfigured("production")).toBe(true);

    delete process.env.XENDIT_API_KEY_PRODUCTION;
    expect(isGatewayConfigured("sandbox")).toBe(true);
    // A hotel switched to live before the live key exists must fail, not
    // silently transact against sandbox.
    expect(isGatewayConfigured("production")).toBe(false);
    expect(xenditKey("production")).toBeUndefined();
  });

  it("throws when the key for that environment is missing", async () => {
    delete process.env.XENDIT_API_KEY_SANDBOX;
    await expect(createInvoiceViaGateway({ externalId: "x", amount: 1 }, "sandbox"))
      .rejects.toThrow(/xendit_not_configured_sandbox/);
  });

  it("keeps Xendit's own message on a rejection", async () => {
    // "duplicate external_id" and "amount below minimum" are both actionable,
    // and look identical without the body.
    const fakeFetch = (async () => ({
      ok: false, status: 400,
      json: async () => ({ error_code: "DUPLICATE_ERROR", message: "external_id sudah dipakai" }),
    } as Response)) as unknown as typeof fetch;

    await expect(createInvoiceViaGateway({ externalId: "x", amount: 1 }, "sandbox", fakeFetch))
      .rejects.toThrow(/xendit_create_failed_400.*DUPLICATE_ERROR/);
  });
});
