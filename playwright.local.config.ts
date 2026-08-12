import { defineConfig, devices } from "@playwright/test";

// UI checks against the local dev server (npm run dev on :8080).
// Run: npx playwright test --config playwright.local.config.ts
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/{template-picker,wa-console,billing-mode}.spec.ts",
  outputDir: "./e2e/__artifacts__/local-results",
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    screenshot: "on",
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
