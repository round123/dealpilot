import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cloudRoot = path.dirname(fileURLToPath(import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(
  cloudRoot,
  "../..",
  ".playwright-browsers",
);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "pwa.spec.ts",
  outputDir: "./test-results/pwa-e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4190",
    browserName: "chromium",
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "pnpm run build:pwa:test && pnpm exec vite preview --host 127.0.0.1 --port 4190 --strictPort",
    cwd: cloudRoot,
    url: "http://127.0.0.1:4190",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "pwa-chromium",
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
