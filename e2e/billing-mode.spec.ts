import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Dua model tagihan Ventera (migration 055), diuji dari sisi yang dipakai
// manusia: konsol super admin.
//
// Yang dijaga di sini:
//   • Halaman detail hotel benar-benar menawarkan pilihan model, dan tarif
//     komisinya DIBACA dari payment_config — bukan angka 7 yang ditulis di JSX.
//   • Menekan "Pakai langganan" mengirim tulisan yang benar ke
//     hotel_payment_config (billing_mode + tarif), karena satu kolom itulah
//     yang membuat trigger DB berhenti memotong 7%.
//   • Halaman penagihan menampilkan tunggakan dan bisa menandai lunas —
//     satu-satunya cara uang langganan (yang masuk lewat transfer, di luar
//     aplikasi) tercatat.
//
// Pembacaannya menembak Supabase sungguhan dengan sesi operator; SETIAP
// TULISAN dicegat dan dijawab palsu, supaya menjalankan tes ini tidak pernah
// mengubah model tagihan hotel yang benar-benar ada.

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "e2e", "__fixtures__", name), "utf8"));

const platformAdmin = fixture("session.platform.json");
const staff = fixture("session.staff.json");
const TENANT = "1c08a9a9-e3af-4ee7-bf37-625a4bfba4a1"; // KEMA MERBABU Glamour Camping

async function signIn(page: any, session: unknown = platformAdmin) {
  await page.context().addInitScript((s: unknown) => {
    sessionStorage.setItem("gostay_sso_session", JSON.stringify(s));
  }, session);
}

test("detail hotel menawarkan dua model tagihan, dan tarif komisinya dari konfigurasi", async ({ page }, testInfo) => {
  await signIn(page);

  // Tulisan apa pun ke konfigurasi hotel dicegat: tes ini tidak boleh memindah
  // model tagihan hotel sungguhan. Isinya diperiksa, lalu dijawab seolah sukses.
  let written: any = null;
  await page.route("**/rest/v1/hotel_payment_config*", async (route) => {
    if (route.request().method() === "GET") return route.continue();
    written = JSON.parse(route.request().postData() ?? "null");
    await route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });

  await page.goto(`/platform/hotels/${TENANT}`);

  await expect(page.getByText("Model Tagihan")).toBeVisible({ timeout: 20_000 });

  // Tarif komisi datang dari payment_config (700 bps) — kalau Ventera
  // mengubahnya, tombol ini ikut berubah tanpa menyentuh kode.
  await expect(page.getByRole("button", { name: /Potongan 7%/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Langganan bulanan/ })).toBeVisible();
  await expect(page.getByText(/Saat ini tiap pembayaran dipotong 7%/)).toBeVisible();

  await testInfo.attach("model-tagihan-komisi", {
    body: await page.screenshot({ fullPage: false }), contentType: "image/png",
  });

  // Pindah ke langganan Rp500.000/bulan, jatuh tempo tanggal 10.
  await page.getByLabel("Tarif per bulan (Rp)").fill("500000");
  await page.getByLabel("Jatuh tempo tiap tanggal").fill("10");
  await page.getByRole("button", { name: "Pakai langganan" }).click();

  await expect.poll(() => written, { timeout: 15_000 }).not.toBeNull();
  expect(written).toMatchObject({
    tenant_id: TENANT,
    billing_mode: "subscription",
    subscription_amount: 500000,
    subscription_day: 10,
  });
  // Payload-nya sempit: mengubah model tagihan tidak boleh ikut menulis
  // lingkungan pembayaran, supaya saklar Live/Off dari tab lain tidak tertimpa
  // snapshot basi halaman ini.
  expect(Object.keys(written).sort()).toEqual(
    ["billing_mode", "subscription_amount", "subscription_day", "subscription_since", "tenant_id", "updated_by"],
  );
  // Tanggal mulai distempel saat hotel BARU masuk langganan.
  expect(written.subscription_since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("halaman langganan menampilkan tunggakan dan bisa menandai lunas", async ({ page }, testInfo) => {
  await signIn(page);

  const bulanIni = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const bulanLalu = new Date();
  bulanLalu.setMonth(bulanLalu.getMonth() - 1);
  const periodeLalu = `${bulanLalu.getFullYear()}-${String(bulanLalu.getMonth() + 1).padStart(2, "0")}-01`;

  // Dua hotel langganan yang disusupkan ke jawaban API: satu menunggak sebulan,
  // satu lagi belum diterbitkan tagihannya bulan ini.
  await page.route("**/rest/v1/hotel_payment_config*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([
        { tenant_id: "t-1", billing_mode: "subscription", subscription_amount: 500000, subscription_day: 10, subscription_since: "2026-06-01", tenants: { name: "Hotel Menunggak", slug: "menunggak" } },
        { tenant_id: "t-2", billing_mode: "subscription", subscription_amount: 750000, subscription_day: 1, subscription_since: "2026-08-01", tenants: { name: "Hotel Rajin", slug: "rajin" } },
      ]),
    });
  });

  let marked: any = null;
  await page.route("**/rest/v1/hotel_subscription_invoices*", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([
          { id: 1, tenant_id: "t-1", period: bulanIni, amount: 500000, status: "unpaid", paid_at: null, paid_method: null, note: null, updated_by: null },
          { id: 2, tenant_id: "t-1", period: periodeLalu, amount: 500000, status: "unpaid", paid_at: null, paid_method: null, note: null, updated_by: null },
        ]),
      });
    }
    marked = JSON.parse(route.request().postData() ?? "null");
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/platform/subscriptions");

  await expect(page.getByRole("heading", { name: "Langganan Bulanan" })).toBeVisible({ timeout: 20_000 });
  // Hotel yang menunggak muncul lebih dulu — itu yang perlu ditagih.
  await expect(page.getByRole("link", { name: "Hotel Menunggak" })).toBeVisible();
  await expect(page.getByText("Rp1.250.000")).toBeVisible();          // 500.000 + 750.000 per bulan
  await expect(page.getByText(/1 bulan · Rp500\.000/)).toBeVisible(); // tunggakan bulan lalu
  await expect(page.getByText("belum diterbitkan")).toBeVisible();    // Hotel Rajin bulan ini

  await testInfo.attach("langganan-bulanan", {
    body: await page.screenshot({ fullPage: false }), contentType: "image/png",
  });

  await page.getByRole("button", { name: "Tandai lunas" }).first().click();
  await expect.poll(() => marked, { timeout: 15_000 }).not.toBeNull();
  expect(marked).toMatchObject({ status: "paid", paid_method: "transfer" });
});

test("halaman Saldo hotel langganan tidak lagi bercerita soal potongan 7%", async ({ page }, testInfo) => {
  // Sisi hotel. Ini bukan soal kosmetik: hotel yang membayar bulanan lalu
  // membaca "setiap pembayaran dipotong 7%" akan mengira ditagih dua kali.
  await signIn(page, staff);

  const json = (body: unknown) => ({
    status: 200, contentType: "application/json", body: JSON.stringify(body),
  });

  await page.route("**/rest/v1/hotel_payment_config*", (route) =>
    route.fulfill(json({
      billing_mode: "subscription", subscription_amount: 500000,
      subscription_day: 10, subscription_since: "2026-08-01",
    })));
  await page.route("**/rest/v1/payment_config*", (route) =>
    route.fulfill(json({ mode: "test", platform_fee_bps: 700 })));
  await page.route("**/rest/v1/hotel_balance*", (route) =>
    route.fulfill(json({
      tenant_id: "t-1", available: 2000000, lifetime_gross: 2000000,
      lifetime_fee: 0, lifetime_net: 2000000, lifetime_withdrawn: 0,
      updated_at: "2026-08-12T00:00:00Z",
    })));
  await page.route("**/rest/v1/hotel_subscription_invoices*", (route) =>
    route.fulfill(json([
      { id: 9, period: "2026-08-01", amount: 500000, status: "unpaid", paid_at: null, paid_method: null },
    ])));
  await page.route("**/rest/v1/balance_ledger*", (route) =>
    route.fulfill(json([{
      id: 1, entry_type: "reservation_income", booking_id: null, payment_id: null, payout_id: null,
      gross_amount: 2000000, fee_amount: 0, net_amount: 2000000, fee_bps: 0,
      description: "Pendapatan reservasi (langganan bulanan — tanpa potongan)",
      created_at: "2026-08-12T00:00:00Z",
    }])));
  await page.route("**/rest/v1/payouts*", (route) => route.fulfill(json([])));

  await page.goto("/saldo");

  await expect(page.getByText(/berlangganan bulanan — pendapatan reservasi masuk penuh/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Langganan per bulan")).toBeVisible();
  await expect(page.getByText(/Hotel ini membayar/)).toBeVisible();
  await expect(page.getByText(/jatuh tempo tiap tanggal/)).toBeVisible();
  await expect(page.getByText(/1 bulan belum dibayar/)).toBeVisible();
  // Kalimat model komisi tidak boleh muncul di hotel yang tidak dipotong.
  await expect(page.getByText(/otomatis dipotong/)).toHaveCount(0);
  // Dan buku besarnya menerangkan sendiri kenapa fee-nya nol.
  await expect(page.getByText(/langganan bulanan — tanpa potongan/)).toBeVisible();

  await testInfo.attach("saldo-hotel-langganan", {
    body: await page.screenshot({ fullPage: false }), contentType: "image/png",
  });
});
