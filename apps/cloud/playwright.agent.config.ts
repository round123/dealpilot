import { defineConfig } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cloudRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(cloudRoot, "../..");
const testResultsRoot = path.resolve(cloudRoot, "test-results");
const agentDataDir = path.join(testResultsRoot, "agent-e2e-data");
const agentDataPreparedKey = "DEALPILOT_AGENT_E2E_DATA_PREPARED";

if (!agentDataDir.startsWith(`${testResultsRoot}${path.sep}`)) {
  throw new Error(
    `Refusing to reset unexpected Agent E2E path: ${agentDataDir}`,
  );
}
if (process.env[agentDataPreparedKey] !== "1") {
  rmSync(agentDataDir, { recursive: true, force: true });
  mkdirSync(agentDataDir, { recursive: true });
  process.env[agentDataPreparedKey] = "1";
}

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(
  repositoryRoot,
  ".playwright-browsers",
);
process.env.DEALPILOT_AGENT_E2E_DATA_DIR = agentDataDir;

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["cloud-demo.spec.ts", "agent-local-tools.spec.ts"],
  outputDir: "./test-results/e2e-agent",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4188",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm exec vite --mode agent --host 127.0.0.1 --port 4188 --strictPort",
      cwd: cloudRoot,
      url: "http://127.0.0.1:4188",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @dealpilot/agent start",
      cwd: repositoryRoot,
      url: "http://127.0.0.1:31081/api/v1/health",
      env: {
        ...process.env,
        DEALPILOT_DATA_DIR: agentDataDir,
        DEALPILOT_WORKBENCH_ORIGIN: "http://127.0.0.1:4188",
        DEALPILOT_ALLOWED_ORIGINS:
          "http://127.0.0.1:4188,http://localhost:4188",
        DEALPILOT_SKIP_BROWSER: "1",
        DEALPILOT_SKIP_NM_REGISTRATION: "1",
        DEALPILOT_SKIP_TRAY: "1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "agent-desktop-1440x900",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "agent-mobile-390x844",
      testMatch: "cloud-demo.spec.ts",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
