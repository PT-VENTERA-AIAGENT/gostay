import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Proves the flow-template dialog can actually be scrolled to its last item.
//
// The Radix ScrollArea it used sized its viewport with `h-full` — a percentage
// that only resolves against a parent with a definite height. Inside the
// dialog's `flex-1` column there was none, so the viewport collapsed and the
// Root's `overflow-hidden` clipped everything past the fold with nothing to
// scroll it: the last templates were unreachable.

const session = JSON.parse(
  readFileSync(path.join(process.cwd(), "e2e", "__fixtures__", "session.staff.json"), "utf8"),
);

test("dialog template bisa di-scroll sampai item terakhir", async ({ page }, testInfo) => {
  await page.context().addInitScript((s) => {
    sessionStorage.setItem("gostay_sso_session", JSON.stringify(s));
  }, session);

  await page.goto("/settings/wa-flows");
  await page.getByRole("button", { name: /Pilih Template|Lihat \d+ Template/ }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Pilih Template Alur")).toBeVisible({ timeout: 20_000 });

  // The scroll container is the dialog's middle column.
  const scroller = dialog.locator("div.overflow-y-auto").first();
  await expect(scroller).toBeVisible();

  const metrics = async () =>
    scroller.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));

  const before = await metrics();
  // There must be something to scroll — otherwise this test would pass on a
  // dialog that simply clipped its content, which is the bug itself.
  expect(before.max).toBeGreaterThan(50);

  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const after = await metrics();
  expect(after.top).toBeGreaterThan(before.top);

  await testInfo.attach("dialog-tergulir-ke-bawah", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
