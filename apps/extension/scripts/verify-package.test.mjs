import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { verifyExtensionPackage } from "./verify-package.mjs";

const temporaryDirectories = [];
const environment = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SB_PUBLISHABLE_KEY: "sb_publishable_public-test-key",
  VITE_DEALPILOT_WEB_URL: "https://crm.example.com/",
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("accepts a configured Manifest V3 Chrome archive", () => {
  const outputDirectory = createPackageFixture();

  const archive = verifyExtensionPackage({ outputDirectory, environment });

  assert.equal(archive, join(outputDirectory, "dealpilot-0.1.0-chrome.zip"));
});

test("rejects service-role credentials", () => {
  const unsafeEnvironment = {
    ...environment,
    VITE_SB_PUBLISHABLE_KEY: "sb_secret_service_role-key",
  };
  const outputDirectory = createPackageFixture(unsafeEnvironment);

  assert.throws(
    () =>
      verifyExtensionPackage({
        outputDirectory,
        environment: unsafeEnvironment,
      }),
    /must never be embedded/,
  );
});

test("rejects an archive built for a different cloud origin", () => {
  const outputDirectory = createPackageFixture();
  const mismatchedEnvironment = {
    ...environment,
    VITE_SUPABASE_URL: "https://other.supabase.co",
  };

  assert.throws(
    () =>
      verifyExtensionPackage({
        outputDirectory,
        environment: mismatchedEnvironment,
      }),
    /configured Supabase origin/,
  );
});

function createPackageFixture(values = environment) {
  const outputDirectory = mkdtempSync(join(tmpdir(), "dealpilot-extension-"));
  temporaryDirectories.push(outputDirectory);
  const buildDirectory = join(outputDirectory, "chrome-mv3");
  mkdirSync(buildDirectory, { recursive: true });
  writeFileSync(
    join(buildDirectory, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      permissions: ["storage", "activeTab", "alarms"],
      host_permissions: [
        "https://web.whatsapp.com/*",
        "https://web.telegram.org/*",
        `${new URL(values.VITE_SUPABASE_URL).origin}/*`,
      ],
      action: { default_popup: "popup.html" },
    }),
  );
  writeFileSync(
    join(buildDirectory, "background.js"),
    Object.values(values).join("\n"),
  );
  writeFileSync(join(outputDirectory, "dealpilot-0.1.0-chrome.zip"), "PK");
  return outputDirectory;
}
