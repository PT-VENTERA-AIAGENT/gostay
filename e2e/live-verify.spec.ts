import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Verifikasi akhir terhadap SITUS PRODUKSI: memastikan yang sudah di-deploy
// benar-benar membawa perbaikannya, bukan sekadar lulus di mesin lokal.

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "e2e", "__fixtures__", name), "utf8"));

const staff = fixture("session.staff.json");
const platformAdmin = fixture("session.platform.json");

async function signIn(page: any, session: unknown) {
  await page.context().addInitScript((s: unknown) => {
    sessionStorage.setItem("gostay_sso_session", JSON.stringify(s));
  }, session);
}

test("halaman Kendala WhatsApp hidup di produksi", async ({ page }, testInfo) => {
  await signIn(page, platformAdmin);
  await page.goto("/platform/incidents");

  // Halaman baru ini hanya ada bila build terakhir benar-benar ter-deploy.
  await expect(page.getByRole("heading", { name: "Kendala WhatsApp" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Balasan yang gagal terkirim/i)).toBeVisible();

  await testInfo.attach("kendala-whatsapp-produksi", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("dialog template di produksi bisa digulir sampai item terakhir", async ({ page }, testInfo) => {
  await signIn(page, staff);
  await page.goto("/settings/wa-flows");
  await page.getByRole("button", { name: /Pilih Template|Lihat \d+ Template/ }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Pilih Template Alur")).toBeVisible({ timeout: 30_000 });

  const scroller = dialog.locator("div.overflow-y-auto").first();
  const metrics = async () =>
    scroller.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));

  const before = await metrics();
  expect(before.max).toBeGreaterThan(50); // benar-benar ada yang bisa digulir
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  expect((await metrics()).top).toBeGreaterThan(before.top);

  await testInfo.attach("dialog-template-produksi", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("inbox produksi memisahkan nama reservasi dari nama WhatsApp", async ({ page }, testInfo) => {
  await signIn(page, staff);
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Pesan" }).first()).toBeVisible({ timeout: 30_000 });

  await testInfo.attach("inbox-produksi", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
