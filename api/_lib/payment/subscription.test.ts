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
  gateway_env: null, gateway_issued_at: null, gateway_attempt: 0, paid_total: 0,
  gateway_amount: null, gateway_note: null,
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

  it("menagih SISA, bukan nominal penuh, saat sebagian sudah dibayar", async () => {
    // Layar gerbang menyebut sisa; tautan yang menagih penuh akan menagih hotel
    // dua kali untuk bagian yang sudah ia transfer.
    const calls = stubFetch(routes({ ...INVOICE, paid_total: 200000 }));
    const res = await handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" });
    expect(res).toMatchObject({ ok: true, amount: 300000 });
    const body = JSON.parse(String(calls.find((c) => c.url.includes("xendit.local"))!.init?.body));
    expect(body.amount).toBe(300000);
  });

  it("tautan tidak beranak: klik kedua pada sisa yang sama memakai tautan yang ada", async () => {
    // Kalau pemakaian ulang dimatikan begitu ada pembayaran sebagian, tiap klik
    // menerbitkan invoice baru yang semuanya tetap bisa dibayar.
    const calls = stubFetch(routes({
      ...INVOICE, paid_total: 200000, gateway_ref: "inv-lama",
      gateway_url: "https://pay.xendit/lama", gateway_env: "test",
      gateway_amount: 300000, gateway_issued_at: new Date().toISOString(), gateway_attempt: 1,
    }));
    await expect(handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" }))
      .resolves.toMatchObject({ reused: true, amount: 300000 });
    expect(calls.filter((c) => c.url.includes("xendit.local"))).toHaveLength(0);
  });

  it("tidak memakai ulang tautan yang nominalnya sudah basi", async () => {
    // Tautan terbit untuk Rp500.000, lalu transfer Rp200.000 masuk. Memakai
    // ulang tautan itu berarti menyodorkan angka yang sudah pasti salah.
    const calls = stubFetch(routes({
      ...INVOICE, paid_total: 200000, gateway_ref: "inv-lama",
      gateway_url: "https://pay.xendit/lama", gateway_env: "test",
      gateway_issued_at: new Date().toISOString(), gateway_attempt: 1,
      gateway_amount: 500000,   // terbit sebelum transfer Rp200.000 masuk
    }));
    await expect(handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" }))
      .resolves.toMatchObject({ reused: false, amount: 300000 });
    expect(calls.filter((c) => c.url.includes("xendit.local"))).toHaveLength(1);
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
      gateway_amount: 500000,   // masih sama dengan sisa → boleh dipakai ulang
    };
    const calls = stubFetch(routes(segar));
    const res = await handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" });
    expect(res).toMatchObject({ ok: true, invoiceUrl: "https://pay.xendit/lama", reused: true });
    expect(calls.filter((c) => c.url.includes("xendit.local"))).toHaveLength(0);
  });

  it("jangka pakai-ulang tidak lebih pendek dari umur invoice", async () => {
    // Kalau jangkanya dipersempit, tautan pengganti terbit SEBELUM yang lama
    // mati: satu bulan punya dua tautan hidup dan hotel bisa membayar dua kali.
    // Invoice yang diterbitkan tepat di bawah TTL harus masih dipakai ulang.
    const hampirHabis = {
      ...INVOICE, gateway_ref: "inv-lama", gateway_url: "https://pay.xendit/lama",
      gateway_env: "test", gateway_attempt: 1, gateway_amount: 500000,
      gateway_issued_at: new Date(Date.now() - (20 * 60 * 60 - 60) * 1000).toISOString(),
    };
    const calls = stubFetch(routes(hampirHabis));
    await expect(handleSubscriptionCheckout({ invoiceId: 7, profileId: "p-1" }))
      .resolves.toMatchObject({ reused: true });
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
      gateway_env: "test", gateway_attempt: 0, gateway_amount: 500000,
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
    invoice_id: "inv-xnd-1", status: "PAID", amount: 500000, paid_amount: 500000,
  };

  /** Rute bersama: pencarian tagihan + penulisan buku pembayaran + patch catatan. */
  const wh = (invoice: unknown, opts: { insertStatus?: number } = {}) => [
    { match: (u: string, i?: RequestInit) => u.includes("/subscription_payments") && i?.method === "POST",
      reply: () => [{ id: 1 }], status: opts.insertStatus ?? 201 },
    { match: (u: string, i?: RequestInit) => u.includes("/hotel_subscription_invoices") && i?.method === "PATCH",
      reply: () => [{ id: 7 }] },
    { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => (invoice ? [invoice] : []) },
    { match: (u: string) => u.includes("gateway_external_id=eq."), reply: () => [] },
    { match: (u: string) => u.includes("gateway_external_id=like."), reply: () => [] },
  ];

  const posted = (calls: Array<{ url: string; init?: RequestInit }>) =>
    JSON.parse(String(calls.find((c) => c.url.includes("/subscription_payments"))!.init?.body));
  const patched = (calls: Array<{ url: string; init?: RequestInit }>) => {
    const c = calls.find((x) => x.init?.method === "PATCH");
    return c ? JSON.parse(String(c.init?.body)) : null;
  };

  it("mencatat uangnya di buku pembayaran, bukan menambal status", async () => {
    const calls = stubFetch(wh({ ...INVOICE, gateway_ref: "inv-xnd-1" }));
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "recorded" });

    expect(posted(calls)).toMatchObject({
      tenant_id: "t-1", invoice_id: 7, amount: 500000, method: "xendit",
      gateway_ref: "inv-xnd-1", gateway_env: "test",
    });
    // Statusnya diturunkan trigger dari buku itu — bukan ditulis dari sini.
    expect(patched(calls)?.status).toBeUndefined();
  });

  it("TIDAK PERNAH menyentuh tabel payments milik saldo hotel", async () => {
    const calls = stubFetch(wh({ ...INVOICE, gateway_ref: "inv-xnd-1" }));
    await handleWebhook("tok-sandbox", body);
    // `/rest/v1/payments` — bukan `subscription_payments`, yang justru wajib.
    expect(calls.filter((c) => c.url.includes("/rest/v1/payments"))).toHaveLength(0);
    expect(calls.filter((c) => c.url.includes("/bookings"))).toHaveLength(0);
  });

  it("callback yang diulang ditolak database dan dijawab duplicate", async () => {
    // UNIQUE gateway_ref: uang yang sama tidak bisa masuk buku dua kali.
    const calls = stubFetch(wh({ ...INVOICE, gateway_ref: "inv-xnd-1" }, { insertStatus: 409 }));
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "duplicate" });
    expect(calls.filter((c) => c.init?.method === "PATCH")).toHaveLength(0);
  });

  it("kurang bayar tetap dicatat uangnya, tapi tidak melunasi", async () => {
    // Bentuk payload Xendit yang asli: `amount` nominal tagihan, `paid_amount`
    // yang dibayar. Membaca `amount` membuat guard ini tak pernah menyala.
    const calls = stubFetch(wh({ ...INVOICE, gateway_ref: "inv-xnd-1" }));
    await expect(handleWebhook("tok-sandbox", { ...body, amount: 500000, paid_amount: 300000 }))
      .resolves.toMatchObject({ ok: true, outcome: "ignored" });

    expect(posted(calls).amount).toBe(300000);   // uangnya tetap masuk buku
    const p = patched(calls);
    expect(p.status).toBeUndefined();
    expect(String(p.gateway_note)).toContain("Rp300.000");
    expect(String(p.gateway_note)).toContain("kurang Rp200.000");
    expect(p.note).toBeUndefined();              // catatan operator utuh
  });

  it("pembayaran kedua yang JUSTRU melunasi tidak dicap kurang bayar", async () => {
    // Operator sudah mencatat transfer Rp200.000; tautan online Rp300.000
    // dibayar. Membandingkan pembayaran ini sendirian dengan nominal tagihan
    // akan menempelkan peringatan palsu pada tagihan yang justru sudah beres.
    const calls = stubFetch(wh({ ...INVOICE, gateway_ref: "inv-xnd-1", paid_total: 200000 }));
    await expect(handleWebhook("tok-sandbox", { ...body, amount: 500000, paid_amount: 300000 }))
      .resolves.toMatchObject({ ok: true, outcome: "recorded" });
    expect(posted(calls).amount).toBe(300000);
  });

  it("tagihan yang keburu dibebaskan: uang tercatat, statusnya tidak diubah", async () => {
    const calls = stubFetch(wh({ ...INVOICE, status: "waived", gateway_ref: "inv-xnd-1" }));
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "ignored" });
    expect(posted(calls).amount).toBe(500000);
    expect(String(patched(calls).gateway_note)).toContain("dibebaskan");
  });

  it("pembayaran KEDUA atas bulan yang sudah lunas meninggalkan jejak", async () => {
    const calls = stubFetch(wh({ ...INVOICE, status: "paid", gateway_ref: "inv-PERTAMA" }));
    await expect(handleWebhook("tok-sandbox", { ...body, invoice_id: "inv-KEDUA" }))
      .resolves.toMatchObject({ ok: true, outcome: "ignored" });
    const note = String(patched(calls).gateway_note);
    expect(note).toContain("inv-PERTAMA");
    expect(note).toContain("inv-KEDUA");
  });

  it("lunas lewat transfer lalu pembayaran online tetap masuk", async () => {
    // Kasus bayar-dua-kali yang paling mudah terjadi: operator sudah menandai
    // lunas (tanpa gateway_ref), tautan online-nya tetap dibayar.
    const calls = stubFetch(wh({ ...INVOICE, status: "paid", paid_method: "transfer", gateway_ref: null }));
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "ignored" });
    expect(String(patched(calls).gateway_note)).toContain("Pembayaran ganda");
  });

  it("pelunasan penuh membersihkan peringatan kurang bayar sebelumnya", async () => {
    const calls = stubFetch(wh({ ...INVOICE, gateway_ref: "inv-xnd-1", gateway_note: "Pembayaran online kurang: …" }));
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "recorded" });
    expect(patched(calls).gateway_note).toBeNull();
  });

  it("mengenali tagihan lewat external_id saat id Xendit belum tersimpan", async () => {
    stubFetch([
      { match: (u: string, i?: RequestInit) => u.includes("/subscription_payments") && i?.method === "POST", reply: () => [{ id: 1 }], status: 201 },
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [] },
      { match: (u: string) => u.includes("gateway_external_id=eq."), reply: () => [INVOICE] },
    ]);
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "recorded" });
  });

  it("menemukan tagihan lewat bulannya saat invoice lama jadi yatim", async () => {
    // Dua tab menekan Bayar hampir bersamaan: baris tagihan hanya menyimpan
    // external_id yang terakhir, sementara yang dibayar adalah invoice pertama.
    const calls = stubFetch([
      { match: (u: string, i?: RequestInit) => u.includes("/subscription_payments") && i?.method === "POST", reply: () => [{ id: 1 }], status: 201 },
      { match: (u: string) => u.includes("gateway_ref=eq."), reply: () => [] },
      { match: (u: string) => u.includes("gateway_external_id=eq."), reply: () => [] },
      { match: (u: string) => u.includes("gateway_external_id=like."), reply: () => [{ ...INVOICE, gateway_external_id: "GOSTAY-SUB-KOPI-RINTIK-202608-R1" }] },
    ]);
    await expect(handleWebhook("tok-sandbox", body)).resolves.toMatchObject({ ok: true, outcome: "recorded" });
    expect(calls.some((c) => c.url.includes("like.GOSTAY-SUB-KOPI-RINTIK-202608"))).toBe(true);
  });

  it("menolak external_id ber-wildcard yang bisa melunasi tagihan hotel lain", async () => {
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
