import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import packageJsonSource from "../package.json?raw";
import viteConfigSource from "../vite.config.ts?raw";
import crmSource from "./components/atomic-crm/root/CRM.tsx?raw";
import settingsSource from "./components/atomic-crm/settings/SettingsPage.tsx?raw";
import mobileSettingsSource from "./components/atomic-crm/settings/SettingsPageMobile.tsx?raw";
import personalAccountSource from "./components/atomic-crm/providers/personalAccount.ts?raw";

describe("Cloud runtime boundary", () => {
  it("keeps the application entrypoint Cloud-only", () => {
    expect(appSource).not.toContain("createAgentRuntime");
    expect(appSource).not.toContain("providers/agent");
    expect(appSource).not.toContain("VITE_DATA_BACKEND");
    expect(appSource).toContain("import.meta.env.DEV");
    expect(appSource).toContain('import.meta.env.MODE === "demo"');
  });

  it("does not expose an Agent proxy or Agent build scripts", () => {
    const packageJson = JSON.parse(packageJsonSource) as {
      scripts: Record<string, string>;
    };
    expect(viteConfigSource).not.toContain("DEALPILOT_AGENT_ORIGIN");
    expect(viteConfigSource).not.toContain("proxy:");
    expect(packageJson.scripts).not.toHaveProperty("dev:agent");
    expect(packageJson.scripts).not.toHaveProperty("build:agent");
  });

  it("does not register local SQLite tools in production routes", () => {
    expect(crmSource).not.toContain("LocalDataToolsPage");
    expect(crmSource).not.toContain("LocalDataOperations");
    expect(crmSource).not.toContain("LocalPrivacyGuard");
    expect(crmSource).not.toContain("createLocalCustomerOperations");
    expect(crmSource).not.toContain("VITE_DATA_BACKEND");
  });

  it("does not expose self-service account deletion", () => {
    expect(settingsSource).not.toContain("AccountDeletion");
    expect(mobileSettingsSource).not.toContain("DeleteAccount");
    expect(personalAccountSource).not.toContain("deleteAccount");
    expect(personalAccountSource).not.toContain("delete-account");
  });

  it("gates demo customer operations behind the demo development runtime", () => {
    expect(crmSource).toContain("import.meta.env.DEV");
    expect(crmSource).toContain('import.meta.env.MODE === "demo"');
    expect(crmSource).toContain('import.meta.env.VITE_IS_DEMO === "true"');
  });
});
