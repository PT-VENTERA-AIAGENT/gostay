// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createInvoiceViaGateway, isGatewayConfigured } from "./gateway";

describe("createInvoiceViaGateway", () => {
  beforeEach(() => {
    process.env.VENTERA_GATEWAY_URL = "https://gw.ventera/";
    process.env.INTERNAL_TOKEN_SANDBOX = "sandbox-tok";
    process.env.INTERNAL_TOKEN_PRODUCTION = "prod-tok";
  });
  afterEach(() => {
    delete process.env.VENTERA_GATEWAY_URL;
    delete process.env.INTERNAL_TOKEN_SANDBOX;
    delete process.env.INTERNAL_TOKEN_PRODUCTION;
  });

  it("posts prefix+environment+external_id with the env's internal token", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return { ok: true, status: 200, json: async () => ({
        invoice_id: "inv_9", invoice_url: "https://pay/inv_9", status: "PENDING", amount: 950000, external_id: "GOSTAY-BK-1",
      }) } as Response;
    }) as unknown as typeof fetch;

    const inv = await createInvoiceViaGateway(
      { externalId: "GOSTAY-BK-1", amount: 950000, payerEmail: "g@h.com" },
      "sandbox", fakeFetch,
    );

    expect(inv.invoiceUrl).toBe("https://pay/inv_9");
    expect(inv.id).toBe("inv_9");
    expect(captured!.url).toBe("https://gw.ventera/internal/payment/create"); // trailing slash trimmed
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["x-internal-token"]).toBe("sandbox-tok");
    const body = JSON.parse(captured!.init.body as string);
    expect(body).toMatchObject({ prefix: "GOSTAY", environment: "sandbox", external_id: "GOSTAY-BK-1", amount: 950000 });
  });

  it("uses the production token in production", async () => {
    let token = "";
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      token = (init.headers as Record<string, string>)["x-internal-token"];
      return { ok: true, status: 200, json: async () => ({ invoice_id: "i", invoice_url: "u" }) } as Response;
    }) as unknown as typeof fetch;
    await createInvoiceViaGateway({ externalId: "GOSTAY-BK-2", amount: 100 }, "production", fakeFetch);
    expect(token).toBe("prod-tok");
  });

  it("throws when the gateway is not configured", async () => {
    delete process.env.VENTERA_GATEWAY_URL;
    await expect(createInvoiceViaGateway({ externalId: "x", amount: 1 }, "sandbox"))
      .rejects.toThrow(/gateway_not_configured/);
    expect(isGatewayConfigured("sandbox")).toBe(false);
  });

  it("throws on a non-2xx gateway response", async () => {
    const fakeFetch = (async () => ({ ok: false, status: 502, json: async () => ({ error: "bad" }) } as Response)) as unknown as typeof fetch;
    await expect(createInvoiceViaGateway({ externalId: "x", amount: 1 }, "sandbox", fakeFetch))
      .rejects.toThrow(/gateway_create_failed_502/);
  });
});
