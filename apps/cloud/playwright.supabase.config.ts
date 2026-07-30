import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  requireSupabasePublicEnvironment,
  SUPABASE_E2E_PORT,
} from "./e2e/supabase-test-env";

const cloudRoot = path.dirname(fileURLToPath(import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(
  cloudRoot,
  "../..",
  ".playwright-browsers",
);

const hasPublicEnvironment =
  Boolean(process.env.SUPABASE_URL ?? process.env.API_URL) &&
  Boolean(process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY);
const publicEnvironment = hasPublicEnvironment
  ? requireSupabasePublicEnvironment()
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "supabase-isolation.spec.ts",
  outputDir: "./test-results/supabase-e2e",
  globalSetup: "./e2e/supabase-global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${SUPABASE_E2E_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.CI
    ? undefined
    : {
        command: `pnpm exec vite --host 127.0.0.1 --port ${SUPABASE_E2E_PORT}`,
        cwd: cloudRoot,
        url: `http://127.0.0.1:${SUPABASE_E2E_PORT}`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          VITE_SUPABASE_URL: publicEnvironment?.url ?? "",
          VITE_SB_PUBLISHABLE_KEY: publicEnvironment?.anonKey ?? "",
          SUPABASE_SERVICE_ROLE_KEY: "",
          SERVICE_ROLE_KEY: "",
        },
      },
  projects: [
    {
      name: "local-supabase-chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
  ],
});
