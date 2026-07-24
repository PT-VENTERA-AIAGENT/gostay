import { defineConfig, devices } from "@playwright/test";

// Live-web E2E: drives the deployed app at app.gostay.id (same Supabase backend),
// logged in as real staff via an injected session. No web server — it hits the
// live site directly. Run: npx playwright test --config playwright.live.config.ts
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/app-live.spec.ts",
  outputDir: "./e2e/__artifacts__/live-results",
  timeout: 90_000,
  reporter: [["list"], ["html", { outputFolder: "./e2e/report-live", open: "never" }]],
  use: {
    baseURL: "https://app.gostay.id",
    screenshot: "on",
    trace: "on",
    viewport: { width: 1280, height: 1200 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
