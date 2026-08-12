// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  subscriptionExternalId, isSubscriptionExternalId, handleSubscriptionCheckout,
} from "./subscription";
import { handleWebhook } from "./handlers";

/**
 * Pembayaran langganan online.
 *
 * Satu hal yang dijaga di atas segalanya: uang langganan milik VENTERA. Kalau
 * jalur ini pernah menulis ke tabel `payments`, trigger saldo akan mengkredit
 * hotel dengan uang yang ditagihkan kepadanya lalu memotong 7% dari pendapatan
 * Ventera sendiri — dua kesalahan sekaligus, dan keduanya berupa uang yang
 * berpindah diam-diam. Beberapa tes di bawah ada khusus untuk itu.
 */

describe("subscriptionExternalId — bentuk yang dikenali router callback", () => {
  it("memakai awalan GOSTAY- dan penanda SUB-", () => {
    // Awalannya tidak boleh bergeser: router Ventera memilih tujuan dari situ.
    expect(subscriptionExternalId("kopi-rintik", "2026-08-01")).toBe("GOSTAY-SUB-KOPI-RINTIK-202608");
  });

  it("menormalkan slug dan tetap terbaca di dashboard Xendit", () => {
    expect(subscriptionExternalId("KEMA Merbabu!!", "2026-12-01")).toBe("GOSTAY-SUB-KEMA-MERBABU-202612");
  });

  it("tetap sah saat slug hotel tidak terbaca", () => {
    expect(subscriptionExternalId(null, "2026-08-01")).toBe("GOSTAY-SUB-202608");
  });

  it("memberi sufiks percobaan ulang — Xendit menolak external_id kembar", () => {
    expect(subscriptionExternalId("lor-kali", "2026-08-01", 2)).toBe("GOSTAY-SUB-LOR-KALI-202608-R2");
  });

  it("membedakan dirinya dari invoice reservasi", () => {
    expect(isSubscriptionExternalId("GOSTAY-SUB-KOPI-RINTIK-202608")).toBe(true);
    expect(isSubscriptionExternalId("GOSTAY-SUB-KOPI-RINTIK-202608-R2")).toBe(true);
    expect(isSubscriptionExternalId("GOSTAY-KOPI-RINTIK-BK-20260812-93FD")).toBe(false);
    expect(isSubscriptionExternalId("GOSTAY-BK-1")).toBe(false);
    expect(isSubscriptionExternalId(undefined)).toBe(false);
  });

  it("tidak membajak reservasi milik hotel yang slug-nya dimulai 'sub'", () => {
    // `sub-urban-stay` menghasilkan GOSTAY-SUB-URBAN-STAY-BK-… . Kalau ini
    // terbaca sebagai langganan, pembayaran tamunya dijawab 404, tidak pernah
    // tercatat, dan saldo hotel itu tidak pernah dikredit — hanya hotel itu,
    // diam-diam, selamanya.
    expect(isSubscriptionExternalId("GOSTAY-SUB-URBAN-STAY-BK-20260812-93FD")).toBe(false);
    expect(isSubscriptionExternalId("GOSTAY-SUBUR-BK-20260101-AAAA")).toBe(false);
    // Hotel itu tetap bisa punya tagihan langganan sungguhan.
    expect(isSubscriptionExternalId("GOSTAY-SUB-SUB-URBAN-STAY-202608")).toBe(true);
  });
});

// ─── Bantu: PostgREST palsu ───────────────────────────────────────────────────
type Route = { match: (url: string, init?: RequestInit) => boolean; reply: () => unknown; status?: number };

function stubFetch(routes: Route[], onCall?: (url: string, init?: RequestInit) => void) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    onCall?.(String(url), init);
    const r = routes.find((x) => x.match(String(url), init));
    if (!r) return { ok: false, status: 404, json: async () => ({}) } as Response;
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.reply() } as Response;
  }) as unknown as typeof fetch);
  return calls;
}

const INVOICE = {
  id: 7, tenant_id: "t-1", period: "2026-08-01", amount: 500000, status: "unpaid",
  gateway_ref: null, gateway_external_id: null, gateway_url: null,
  gateway_env: null, gateway_issued_at: null, gateway_attempt: 0,
};

describe("handleSubscriptionCheckout", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = "https://db.local";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.XENDIT_API_KEY_SANDBOX = "xnd_development_x";
    process.env.XENDIT_API_URL = "https://xendit.local/v2/invoices";
  });
  afterEach(() => { process.env = { ...OLD }; vi.unstubAllGlobals(); });

  // PATCH didaftarkan LEBIH DULU: route GET di bawahnya tidak memeriksa method,
  // jadi kalau urutannya terbalik ia yang selalu menang dan route PATCH mati.
  const routes = (invoice: unknown, profile: unknown = [{ tenant_id: "t-1", role: "staff", is_active: true }]) => [
    { match: (u: string, i?: RequestInit) => u.includes("/hotel_subscription_invoices?id=eq.") && i?.method === "PATCH", reply: () => [{ id: 7 }] },
    { match: (u: string) => u.includes("/profiles?"), reply: () => profile },
    { match: (u: string) => u.includes("/hotel_subscription_invoices?id=eq."), reply: () => [invoice] },
    { match: (u: string) => u.includes("/payment_config?"), reply: () => [{ subscription_mode: "test" }] },
    { match: (u: string) => u.includes("/tenants?"), reply: () => [{ slug: "kopi-rintik", name: "Kopi Rintik" }] },
    { match: (u: string) => u.includes("xendit.local"), reply: () => ({ id: "inv-xnd-1", invoice_url: "https://pay.xendit/inv-1", status: "PENDING", amount: 500000 }) },
  ];

  it("menerbitkan tautan dan menyimpan jejaknya di baris tagihan", async () => {
    const calls = stubFetch(routes(INVOICE));
    const res = await handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" });

    expect(res).toMatchObject({ ok: true, invoiceUrl: "https://pay.xendit/inv-1", amount: 500000, reused: false });

    // Nominalnya dari baris tagihan, BUKAN dari permintaan.
    const xendit = calls.find((c) => c.url.includes("xendit.local"))!;
    const body = JSON.parse(String(xendit.init?.body));
    expect(body.amount).toBe(500000);
    expect(body.external_id).toBe("GOSTAY-SUB-KOPI-RINTIK-202608");

    // Jejaknya tersimpan supaya webhook bisa menemukan barisnya tanpa menebak.
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(JSON.parse(String(patch.init?.body))).toMatchObject({
      gateway_ref: "inv-xnd-1",
      gateway_external_id: "GOSTAY-SUB-KOPI-RINTIK-202608",
      gateway_env: "test",
    });
  });

  it("TIDAK PERNAH menyentuh tabel payments — uang ini milik Ventera", async () => {
    const calls = stubFetch(routes(INVOICE));
    await handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" });
    expect(calls.filter((c) => c.url.includes("/payments"))).toHaveLength(0);
  });

  it("menolak tagihan milik hotel lain seperti tagihan yang tidak ada", async () => {
    stubFetch(routes({ ...INVOICE, tenant_id: "hotel-lain" }));
    // Jawaban yang berbeda akan mengubah endpoint ini jadi alat mengintip
    // tagihan hotel sebelah.
    await expect(handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" }))
      .resolves.toMatchObject({ ok: false, status: 404, error: "invoice_not_found" });
  });

  it("menolak pemanggil yang bukan orang hotel", async () => {
    stubFetch(routes(INVOICE, [{ tenant_id: "t-1", role: "customer", is_active: true }]));
    await expect(handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" }))
      .resolves.toMatchObject({ ok: false, status: 403, error: "not_hotel_member" });
  });

  it("menolak tagihan yang sudah lunas, tanpa menerbitkan apa pun", async () => {
    const calls = stubFetch(routes({ ...INVOICE, status: "paid" }));
    await expect(handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" }))
      .resolves.toMatchObject({ ok: false, status: 409, error: "already_paid" });
    expect(calls.filter((c) => c.url.includes("xendit.local"))).toHaveLength(0);
  });

  it("memakai ulang tautan yang masih hidup, bukan menumpuk tagihan kembar", async () => {
    const segar = {
      ...INVOICE, gateway_ref: "inv-lama", gateway_url: "https://pay.xendit/lama",
      gateway_env: "test", gateway_issued_at: new Date().toISOString(), gateway_attempt: 1,
    };
    const calls = stubFetch(routes(segar));
    const res = await handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" });
    expect(res).toMatchObject({ ok: true, invoiceUrl: "https://pay.xendit/lama", reused: true });
    expect(calls.filter((c) => c.url.includes("xendit.local"))).toHaveLength(0);
  });

  it("mengunci umur invoice, supaya tautan lama mati sebelum penggantinya terbit", async () => {
    // Tanpa ini Xendit memakai bawaan akun (±24 jam) sementara kita memakai
    // ulang tautannya 20 jam: ada 4 jam ketika tautan LAMA masih bisa dibayar
    // padahal barisnya sudah menunjuk yang baru. Hotel yang membayar dari tab
    // lama mengirim uang yang tagihannya tetap tercatat belum lunas.
    const calls = stubFetch(routes(INVOICE));
    await handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" });
    const body = JSON.parse(String(calls.find((c) => c.url.includes("xendit.local"))!.init?.body));
    expect(body.invoice_duration).toBe(20 * 60 * 60);
  });

  it("menjawab service_not_configured saat kunci Xendit belum diisi", async () => {
    delete process.env.XENDIT_API_KEY_SANDBOX;
    const calls = stubFetch(routes(INVOICE));
    await expect(handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" }))
      .resolves.toMatchObject({ ok: false, status: 503, error: "service_not_configured" });
    expect(calls.filter((c) => c.url.includes("xendit.local"))).toHaveLength(0);
  });

  it("menerbitkan ulang dengan sufiks -R saat tautan lama sudah kedaluwarsa", async () => {
    const basi = {
      ...INVOICE, gateway_ref: "inv-lama", gateway_url: "https://pay.xendit/lama",
      gateway_env: "test", gateway_attempt: 0,
      gateway_external_id: "GOSTAY-SUB-KOPI-RINTIK-202608",
      gateway_issued_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    };
    const calls = stubFetch(routes(basi));
    await handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" });
    const xendit = calls.find((c) => c.url.includes("xendit.local"))!;
    // external_id lama tidak boleh dipakai ulang — Xendit menolaknya.
    expect(JSON.parse(String(xendit.init?.body)).external_id).toBe("GOSTAY-SUB-KOPI-RINTIK-202608-R1");
  });
});

describe("handleWebhook — cabang langganan", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = "https://db.local";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.INTERNAL_TOKEN_SANDBOX = "tok-sandbox";
  });
  afterEach(() => { process.env = { ...OLD }; vi.unstubAllGlobals(); });

  const body = {
    external_id: "GOSTAY-SUB-KOPI-RINTIK-202608",
    invoice_id: "inv-xnd-1", status: "PAID", amount: 500000,
  };

  it("menandai tagihan lunas tanpa membuat baris payments", async () => {
    const calls = stubFetch([
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [{ ...INVOICE, gateway_ref: "inv-xnd-1" }] },
      { match: (u: string, i?: RequestInit) => i?.method === "PATCH", reply: () => [{ id: 7 }] },
    ]);
    const res = await handleWebhook("tok-sandbox", body);
    expect(res).toMatchObject({ ok: true, outcome: "recorded", status: 200 });

    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(patch.url).toContain("hotel_subscription_invoices");
    expect(JSON.parse(String(patch.init?.body))).toMatchObject({ status: "paid", paid_method: "xendit" });

    // Inti dari semuanya.
    expect(calls.filter((c) => c.url.includes("/payments"))).toHaveLength(0);
    expect(calls.filter((c) => c.url.includes("/bookings"))).toHaveLength(0);
  });

  it("callback berulang untuk tagihan yang sudah lunas tidak menulis apa pun", async () => {
    const calls = stubFetch([
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [{ ...INVOICE, status: "paid", gateway_ref: "inv-xnd-1" }] },
    ]);
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "duplicate" });
    expect(calls.filter((c) => c.init?.method === "PATCH")).toHaveLength(0);
  });

  it("mengenali tagihan lewat external_id saat id Xendit belum tersimpan", async () => {
    stubFetch([
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [] },
      { match: (u: string) => u.includes("gateway_external_id=eq."), reply: () => [INVOICE] },
      { match: (u: string, i?: RequestInit) => i?.method === "PATCH", reply: () => [{ id: 7 }] },
    ]);
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "recorded" });
  });

  it("menemukan tagihan lewat bulannya saat invoice lama jadi yatim", async () => {
    // Dua tab menekan Bayar hampir bersamaan: baris tagihan hanya menyimpan
    // external_id yang terakhir (-R1), sementara yang dibayar hotel adalah
    // invoice pertama. Tanpa upaya pencocokan per-bulan ini, uangnya masuk ke
    // Ventera sementara tagihannya tetap tercatat belum lunas.
    const calls = stubFetch([
      { match: (u: string, i?: RequestInit) => i?.method === "PATCH", reply: () => [{ id: 7 }] },
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [] },
      { match: (u: string) => u.includes("gateway_external_id=eq."), reply: () => [] },
      { match: (u: string) => u.includes("gateway_external_id=like."), reply: () => [{ ...INVOICE, gateway_external_id: "GOSTAY-SUB-KOPI-RINTIK-202608-R1" }] },
    ]);
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "recorded" });
    expect(calls.some((c) => c.url.includes("like.GOSTAY-SUB-KOPI-RINTIK-202608"))).toBe(true);
  });

  it("kurang bayar pada BENTUK PAYLOAD XENDIT tidak dianggap lunas", async () => {
    // Bentuk aslinya: `amount` = nominal tagihan, `paid_amount` = yang dibayar.
    // Membaca `amount` membuat guard ini membandingkan tagihan dengan dirinya
    // sendiri dan tidak pernah menyala — tes yang mengirim `amount: 300000`
    // saja akan lolos tanpa membuktikan apa pun.
    const calls = stubFetch([
      { match: (u: string, i?: RequestInit) => i?.method === "PATCH", reply: () => [{ id: 7 }] },
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [{ ...INVOICE, gateway_ref: "inv-xnd-1" }] },
    ]);
    await expect(handleWebhook("tok-sandbox", { ...body, amount: 500000, paid_amount: 300000 }))
      .resolves.toMatchObject({ ok: true, outcome: "ignored" });

    const patch = JSON.parse(String(calls.find((c) => c.init?.method === "PATCH")!.init?.body));
    expect(patch.status).toBeUndefined();                   // tidak dilunasi
    expect(String(patch.gateway_note)).toContain("300000"); // selisih terlihat operator
    expect(patch.note).toBeUndefined();                     // catatan operator utuh
  });

  it("bayar penuh pada bentuk Xendit tetap melunasi", async () => {
    stubFetch([
      { match: (u: string, i?: RequestInit) => i?.method === "PATCH", reply: () => [{ id: 7 }] },
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [{ ...INVOICE, gateway_ref: "inv-xnd-1" }] },
    ]);
    await expect(handleWebhook("tok-sandbox", { ...body, amount: 500000, paid_amount: 500000 }))
      .resolves.toMatchObject({ ok: true, outcome: "recorded" });
  });

  it("tagihan yang keburu dibebaskan tidak dilunasi diam-diam", async () => {
    const calls = stubFetch([
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [{ ...INVOICE, status: "waived", gateway_ref: "inv-xnd-1" }] },
    ]);
    await expect(handleWebhook("tok-sandbox", { ...body, paid_amount: 500000 }))
      .resolves.toMatchObject({ ok: true, outcome: "ignored" });
    expect(calls.filter((c) => c.init?.method === "PATCH")).toHaveLength(0);
  });

  it("PATCH yang tidak kena baris apa pun tidak dilaporkan sebagai lunas", async () => {
    // PostgREST menjawab 204 baik untuk 1 baris maupun 0. Tanpa
    // return=representation, pelunasan yang filternya meleset terbaca sukses.
    let dibaca = 0;
    const calls = stubFetch([
      { match: (u: string, i?: RequestInit) => i?.method === "PATCH", reply: () => [] },  // 0 baris berubah
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [{ ...INVOICE, gateway_ref: "inv-xnd-1" }] },
      { match: (u: string) => u.includes("?id=eq."), reply: () => { dibaca++; return [{ ...INVOICE, status: "waived" }]; } },
    ]);
    await expect(handleWebhook("tok-sandbox", { ...body, paid_amount: 500000 }))
      .resolves.toMatchObject({ ok: true, outcome: "ignored" });
    expect(dibaca).toBe(1);  // dibaca ulang untuk memisahkan kembar dari basi
    expect(calls.some((c) => c.url.includes("status=eq.unpaid"))).toBe(true);
  });

  it("menolak external_id ber-wildcard yang bisa melunasi tagihan hotel lain", async () => {
    // encodeURIComponent tidak meng-escape `*`. Callback berbekal token dengan
    // external_id ber-wildcard tidak boleh mencocokkan tagihan hotel mana pun.
    const calls = stubFetch([
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [] },
      { match: (u: string) => u.includes("gateway_external_id=eq."), reply: () => [] },
      { match: (u: string) => u.includes("like."), reply: () => [INVOICE] },
    ]);
    await expect(handleWebhook("tok-sandbox", { ...body, external_id: "GOSTAY-SUB-*-202608" }))
      .resolves.toMatchObject({ ok: false, status: 404 });
    expect(calls.some((c) => c.url.includes("like."))).toBe(false);
  });

  it("tagihan yang tidak dikenali dijawab 404, bukan dicatat sebagai booking", async () => {
    stubFetch([
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [] },
      { match: (u: string) => u.includes("gateway_external_id=eq."), reply: () => [] },
      { match: (u: string) => u.includes("gateway_external_id=like."), reply: () => [] },
    ]);
    await expect(handleWebhook("tok-sandbox", body))
      .resolves.toMatchObject({ ok: false, status: 404, error: "subscription_invoice_not_found" });
  });

  it("tetap menolak token yang salah", async () => {
    await expect(handleWebhook("token-ngawur", body))
      .resolves.toMatchObject({ ok: false, status: 401 });
  });

  it("status selain lunas diabaikan", async () => {
    await expect(handleWebhook("tok-sandbox", { ...body, status: "EXPIRED" }))
      .resolves.toMatchObject({ ok: true, outcome: "ignored" });
  });
});
