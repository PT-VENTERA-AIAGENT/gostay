import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Kedua layar yang lahir dari kegagalan nyata:
//   • Konsol alur harus MEMPERINGATKAN saat dua alur berebut kata pemicu yang
//     sama — dulu alur yang kalah mati diam-diam (Housekeeping tak pernah
//     terpicu karena "handuk" direbut Room Service).
//   • Konsol platform harus MENAMPILKAN kegagalan layanan WhatsApp beserta tamu
//     yang mengalaminya — dulu hanya jadi console.error di serverless, sehingga
//     inbox hotel tampak normal padahal tamu tak menerima apa pun.

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "e2e", "__fixtures__", name), "utf8"));

const staff = fixture("session.staff.json");
// Halaman /platform/* hanya terbuka untuk operator di daftar putih platform_admins;
// sesi staf biasa dialihkan ke dasbor hotelnya.
const platformAdmin = fixture("session.platform.json");

async function signIn(page: any, session: unknown, extra: Record<string, string> = {}) {
  await page.context().addInitScript(
    ([s, ex]: [unknown, Record<string, string>]) => {
      sessionStorage.setItem("gostay_sso_session", JSON.stringify(s));
      for (const [k, v] of Object.entries(ex)) sessionStorage.setItem(k, v);
    },
    [session, extra],
  );
}

test("konsol alur memperingatkan kata pemicu yang direbut alur lain", async ({ page }, testInfo) => {
  await signIn(page, staff);

  // Susupkan dua alur yang berebut "handuk" ke jawaban API, supaya peringatan
  // diuji apa adanya tanpa mengotori data hotel sungguhan.
  await page.route("**/rest/v1/wa_flows*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          tenant_id: "t", name: "02 Request Tamu", description: "",
          trigger_keywords: ["menu", "handuk"], requires: "inhouse", priority: 20,
          definition: { version: 1, nodes: [{ id: "t", type: "trigger", data: {} }], edges: [] },
          is_active: true, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          tenant_id: "t", name: "03 Housekeeping", description: "",
          trigger_keywords: ["handuk", "sprei"], requires: "inhouse", priority: 25,
          definition: { version: 1, nodes: [{ id: "t", type: "trigger", data: {} }], edges: [] },
          is_active: true, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
        },
      ]),
    });
  });

  await page.goto("/settings/wa-flows");
  await expect(page.getByRole("heading", { name: "Alur WhatsApp" })).toBeVisible({ timeout: 20_000 });

  const warning = page.getByText(/kata pemicu dipakai lebih dari satu alur/i);
  await expect(warning).toBeVisible({ timeout: 20_000 });
  // Peringatan harus menyebut SIAPA yang merebut dan SIAPA yang jadi korban —
  // tanpa itu operator tidak tahu alur mana yang harus disunting.
  const panel = page.locator("div", { has: warning }).last();
  await expect(panel).toContainText("handuk");
  await expect(panel).toContainText("02 Request Tamu");
  await expect(panel).toContainText("03 Housekeeping");

  await testInfo.attach("peringatan-tabrakan-kata-pemicu", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("konsol platform menampilkan kendala WhatsApp beserta tamunya", async ({ page }, testInfo) => {
  await signIn(page, platformAdmin, { "gostay_platform_scope": "all" });

  await page.route("**/rest/v1/wa_incidents*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "33333333-3333-4333-8333-333333333333",
          kind: "delivery",
          target_jid: "181248240648388@lid",
          reason: "unroutable_lid:send_failed_500",
          message_preview: "Halo! Ada yang bisa kami bantu?",
          resolved_at: null,
          created_at: "2026-07-29T03:47:00Z",
          tenants: { name: "Lor Kali" },
          customers: { full_name: "Ridho", wa_push_name: "Sellora.id" },
        },
      ]),
    });
  });

  await page.goto("/platform/incidents");
  await expect(page.getByRole("heading", { name: "Kendala WhatsApp" })).toBeVisible({ timeout: 20_000 });

  // Tamu yang mengalami, nama akun WhatsApp-nya, dan sebab yang bisa ditindak.
  await expect(page.getByText("Ridho").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Sellora\.id/)).toBeVisible();
  // Di baris tabelnya, bukan di <option> dropdown filter (yang tak terlihat
  // selagi select tertutup).
  await expect(page.getByRole("cell", { name: "Lor Kali" })).toBeVisible();
  // Bukan "send_failed_500" — operator butuh tahu ini permanen, bukan gangguan sesaat.
  await expect(page.getByText(/disembunyikan WhatsApp \(LID\)/i)).toBeVisible();

  await testInfo.attach("kendala-whatsapp-superadmin", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
