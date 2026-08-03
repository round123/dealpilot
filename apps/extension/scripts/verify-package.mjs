import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultOutputDirectory = resolve(scriptDirectory, "../.output");
const textExtensions = new Set([".css", ".html", ".js", ".json"]);

export function verifyExtensionPackage({
  outputDirectory = defaultOutputDirectory,
  environment = process.env,
} = {}) {
  const supabaseUrl = requiredEnvironmentValue(
    environment,
    "VITE_SUPABASE_URL",
  );
  const publishableKey = requiredEnvironmentValue(
    environment,
    "VITE_SB_PUBLISHABLE_KEY",
  );
  const webUrl = requiredEnvironmentValue(
    environment,
    "VITE_DEALPILOT_WEB_URL",
  );
  const supabaseOrigin = requireHttpsOrigin(supabaseUrl, "Supabase");
  requireHttpsOrigin(webUrl, "DealPilot Web");
  assertPublishableKey(publishableKey);

  const buildDirectory = join(outputDirectory, "chrome-mv3");
  const manifest = JSON.parse(
    readFileSync(join(buildDirectory, "manifest.json"), "utf8"),
  );

  assert.equal(manifest.manifest_version, 3, "Expected a Manifest V3 package");
  assert.ok(
    manifest.host_permissions?.includes(`${supabaseOrigin}/*`),
    "The package does not grant access to the configured Supabase origin",
  );
  assert.ok(
    manifest.host_permissions?.includes("https://web.whatsapp.com/*"),
    "The package is missing the WhatsApp Web host permission",
  );
  assert.ok(
    manifest.host_permissions?.includes("https://web.telegram.org/*"),
    "The package is missing the Telegram Web host permission",
  );
  assert.ok(
    !manifest.permissions?.includes("nativeMessaging"),
    "Cloud packages must not request Native Messaging",
  );
  assert.equal(
    manifest.action?.default_popup,
    "popup.html",
    "The extension popup is missing from the package",
  );

  const bundle = collectText(buildDirectory);
  for (const [name, value] of [
    ["Supabase URL", supabaseUrl],
    ["Supabase publishable key", publishableKey],
    ["DealPilot Web URL", webUrl],
  ]) {
    assert.ok(
      bundle.includes(value),
      `${name} was not embedded in the package`,
    );
  }
  assert.ok(
    !/service[_-]?role/i.test(bundle),
    "The extension package contains a service-role marker",
  );

  const archives = readdirSync(outputDirectory)
    .filter((name) => name.endsWith("-chrome.zip"))
    .map((name) => join(outputDirectory, name));
  assert.equal(
    archives.length,
    1,
    "Expected exactly one Chrome package archive",
  );
  assert.ok(
    statSync(archives[0]).size > 0,
    "The Chrome package archive is empty",
  );

  return archives[0];
}

function requiredEnvironmentValue(environment, name) {
  const value = environment[name]?.trim();
  assert.ok(value, `${name} is required to package the extension`);
  return value;
}

function requireHttpsOrigin(value, label) {
  const url = new URL(value);
  assert.equal(url.protocol, "https:", `${label} URL must use HTTPS`);
  assert.equal(
    url.username || url.password,
    "",
    `${label} URL must not contain credentials`,
  );
  return url.origin;
}

function assertPublishableKey(value) {
  assert.ok(
    !/^sb_secret_/i.test(value) && !/service[_-]?role/i.test(value),
    "A service-role or secret key must never be embedded in the extension",
  );

  const [, payload] = value.split(".");
  if (!payload) return;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    assert.notEqual(
      claims.role,
      "service_role",
      "A service-role JWT must never be embedded in the extension",
    );
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
  }
}

function collectText(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectText(path);
      return textExtensions.has(extname(entry.name))
        ? readFileSync(path, "utf8")
        : "";
    })
    .join("\n");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const archive = verifyExtensionPackage();
  console.log(`Verified extension package: ${archive}`);
}
