import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// REAL end-to-end on the LIVE site (app.gostay.id) against the LIVE Supabase,
// logged in as real staff (Budi / Kopi Rintik) via an injected SSO session.
//
// Flow: record a payment through the app's own payment UI → the DB's balance
// trigger credits the hotel NET of the 7% platform fee (the SAME credit path an
// Xendit settlement webhook uses) → open Saldo, see the 7% cut and the net
// balance → withdraw ALL via the real dialog → confirm the balance drains.
//
// NOTE on Xendit: this project holds no Xendit keys and exposes no online-pay
// button (payments route through an external Ventera gateway that isn't wired
// here), so a sandbox card charge can't be driven from the UI. We exercise the
// identical money path via the in-app payment entry instead.

const BOOKING_ID = "c2405ac4-b068-4fab-9a44-3941ba0d8e9b"; // BK-20260721-1A93, Kopi Rintik
const PAY = 1_000_000; // gross; at 7% → fee 70.000, net 930.000

const session = JSON.parse(
  readFileSync(path.join(process.cwd(), "e2e", "__fixtures__", "session.staff.json"), "utf8"),
);

const shot = async (page, testInfo, name: string) => {
  const p = `e2e/__artifacts__/live-${name}.png`;
  const body = await page.screenshot({ path: p, fullPage: true });
  await testInfo.attach(name, { body, contentType: "image/png" });
};

test("Live: catat pembayaran (potong 7%) → tarik semua saldo", async ({ page }, testInfo) => {
  // Inject the staff session before any app script runs, on every navigation.
  await page.context().addInitScript((s) => {
    sessionStorage.setItem("gostay_sso_session", JSON.stringify(s));
  }, session);

  // ── 1. Open the booking (unpaid) ──────────────────────────────────────────
  await page.goto(`/bookings/${BOOKING_ID}`);
  await expect(page.getByRole("button", { name: /Catat Pembayaran/i })).toBeVisible({ timeout: 30_000 });
  await shot(page, testInfo, "1-booking-sebelum-bayar");

  // ── 2. Record a payment through the real UI ───────────────────────────────
  await page.getByRole("button", { name: /Catat Pembayaran/i }).click();
  await page.getByPlaceholder("Jumlah (Rp)").fill(String(PAY));
  await page.getByRole("button", { name: /^Simpan$/ }).click();
  await expect(page.getByText(/Pembayaran dicatat/i).first()).toBeVisible({ timeout: 20_000 });
  await shot(page, testInfo, "2-pembayaran-dicatat");

  // ── 3. Saldo: fee is 7%, balance credited net (930.000) ───────────────────
  await page.goto("/saldo");
  await expect(page.getByText("Tarik Saldo")).toBeVisible({ timeout: 30_000 });
  // The platform fee is shown as a percentage — must be 7%, never the old 5%.
  await expect(page.getByText("7%").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\b5%/)).toHaveCount(0);
  // Net credit visible on the page (Rp930.000 = 1.000.000 − 7%).
  await expect(page.getByText("Rp930.000").first()).toBeVisible({ timeout: 20_000 });
  await shot(page, testInfo, "3-saldo-setelah-bayar-7pct");

  // ── 4. Withdraw ALL via the real dialog ───────────────────────────────────
  await page.getByRole("button", { name: /Tarik Saldo/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByText(/Tarik semua/i).click(); // fills amount with the full available balance
  const textboxes = dialog.getByRole("textbox");
  await textboxes.nth(0).fill("BCA");          // Nama bank
  await textboxes.nth(1).fill("1234567890");   // Nomor rekening
  await textboxes.nth(2).fill("Kopi Rintik");  // Atas nama
  await shot(page, testInfo, "4-dialog-tarik-semua");
  await dialog.getByRole("button", { name: /Kirim Permintaan/i }).click();
  await expect(page.getByText(/Permintaan penarikan dikirim/i).first()).toBeVisible({ timeout: 20_000 });

  // ── 5. Balance drained; withdrawal recorded ───────────────────────────────
  await page.goto("/saldo");
  await expect(page.getByText("Tarik Saldo")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Penarikan saldo/i).first()).toBeVisible({ timeout: 20_000 });
  await shot(page, testInfo, "5-saldo-setelah-tarik-semua");
});
