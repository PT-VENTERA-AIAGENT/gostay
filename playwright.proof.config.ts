import { defineConfig, devices } from "@playwright/test";

// Standalone config for the payment/withdraw PROOF suite (e2e/).
// The repo's default playwright.config.ts pulls in an external Lovable package
// that isn't installed here, so this self-contained config lets the proof run
// today: no web server, no backend — the specs render production fee logic into
// a page and photograph it. Run with:  npx playwright test --config playwright.proof.config.ts
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "./e2e/__artifacts__/test-results",
  fullyParallel: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./e2e/report", open: "never" }],
  ],
  use: {
    screenshot: "on",
    viewport: { width: 1200, height: 900 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
