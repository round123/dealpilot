import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cloudRoot = path.dirname(fileURLToPath(import.meta.url));
const previewPort = 4190;

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(
  cloudRoot,
  "../..",
  ".playwright-browsers",
);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "preview-hosted.spec.ts",
  outputDir: "./test-results/preview-hosted-e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${previewPort}`,
    cwd: cloudRoot,
    url: `http://127.0.0.1:${previewPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "hosted-preview-chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
  ],
});
