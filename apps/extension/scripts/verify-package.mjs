import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import AdmZip from "adm-zip";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultOutputDirectory = resolve(scriptDirectory, "../.output");
const extensionPackage = JSON.parse(
  readFileSync(resolve(scriptDirectory, "../package.json"), "utf8"),
);
const textExtensions = new Set([".css", ".html", ".js", ".json"]);
const expectedPermissions = ["alarms", "storage"];
const messagingHosts = [
  "https://web.telegram.org/*",
  "https://web.whatsapp.com/*",
];
const supportedBrowsers = ["chrome", "edge"];
const iconSizes = ["16", "32", "48", "128"];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function verifyExtensionPackage({
  outputDirectory = defaultOutputDirectory,
  environment = process.env,
  browser = "chrome",
} = {}) {
  assert.ok(
    supportedBrowsers.includes(browser),
    `Unsupported extension browser: ${browser}`,
  );
  const supabaseUrl = requiredEnvironmentValue(environment, "VITE_SUPABASE_URL");
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

  const archive = findArchive(outputDirectory, extensionPackage.version, browser);
  const files = readArchive(archive);
  const manifest = readManifest(files);

  verifyManifest(manifest, files, supabaseOrigin);
  verifyExecutableContent(files);

  const bundle = collectText(files);
  for (const [name, value] of [
    ["Supabase URL", supabaseUrl],
    ["Supabase publishable key", publishableKey],
    ["DealPilot Web URL", webUrl],
  ]) {
    assert.ok(bundle.includes(value), `${name} was not embedded in the package`);
  }
  assert.ok(
    !/service[_-]?role/i.test(bundle),
    "The extension package contains a service-role marker",
  );

  return archive;
}

export function verifyStorePackages(options = {}) {
  const archives = Object.fromEntries(
    supportedBrowsers.map((browser) => [
      browser,
      verifyExtensionPackage({ ...options, browser }),
    ]),
  );
  const versions = supportedBrowsers.map((browser) =>
    readManifest(readArchive(archives[browser])).version,
  );
  assert.equal(
    new Set(versions).size,
    1,
    "Chrome and Edge manifests must have the same version",
  );
  return archives;
}

function findArchive(outputDirectory, version, browser) {
  const archiveSuffix = `-${version}-${browser}.zip`;
  const archives = readdirSync(outputDirectory)
    .filter((name) => name.endsWith(archiveSuffix))
    .map((name) => join(outputDirectory, name));
  assert.equal(
    archives.length,
    1,
    `Expected exactly one ${browserLabel(browser)} ${version} package archive`,
  );
  return archives[0];
}

function browserLabel(browser) {
  return browser === "edge" ? "Edge" : "Chrome";
}

function readArchive(archive) {
  let entries;
  try {
    entries = new AdmZip(archive).getEntries();
  } catch (error) {
    throw new assert.AssertionError({
      message: `The extension package is not a valid ZIP archive: ${error.message}`,
    });
  }

  assert.ok(entries.length > 0, "The extension package archive is empty");
  const files = new Map();
  const seenEntries = new Set();
  for (const entry of entries) {
    const name = entry.entryName.replaceAll("\\", "/");
    assertSafeArchivePath(name);
    assert.ok(!seenEntries.has(name), `Duplicate ZIP entry: ${name}`);
    seenEntries.add(name);
    if (entry.isDirectory) continue;

    try {
      // adm-zip verifies the entry CRC while inflating its data.
      files.set(name, entry.getData());
    } catch (error) {
      throw new assert.AssertionError({
        message: `ZIP entry failed CRC or decompression validation (${name}): ${error.message}`,
      });
    }
  }
  return files;
}

function assertSafeArchivePath(name) {
  assert.ok(name && !name.startsWith("/"), `Unsafe ZIP entry path: ${name}`);
  assert.equal(posix.normalize(name), name, `Unsafe ZIP entry path: ${name}`);
  assert.ok(
    !name.split("/").includes("..") && !/^[A-Za-z]:/.test(name),
    `Unsafe ZIP entry path: ${name}`,
  );
}

function readManifest(files) {
  const manifestBytes = files.get("manifest.json");
  assert.ok(manifestBytes, "The ZIP archive is missing manifest.json");
  try {
    return JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    throw new assert.AssertionError({
      message: `The ZIP manifest.json is invalid JSON: ${error.message}`,
    });
  }
}

function verifyManifest(manifest, files, supabaseOrigin) {
  assert.equal(manifest.manifest_version, 3, "Expected a Manifest V3 package");
  assert.equal(
    manifest.version,
    extensionPackage.version,
    "Manifest version must match the extension package version",
  );
  assert.match(
    manifest.version,
    /^\d+(?:\.\d+){0,3}$/,
    "Manifest version must use Chrome's numeric version format",
  );

  assertExactSet(
    manifest.permissions,
    expectedPermissions,
    "permissions",
  );
  assertExactSet(manifest.optional_permissions ?? [], [], "optional_permissions");
  assertExactSet(
    manifest.optional_host_permissions ?? [],
    [],
    "optional_host_permissions",
  );
  assertExactSet(
    manifest.host_permissions,
    [...messagingHosts, `${supabaseOrigin}/*`],
    "host_permissions",
  );

  assert.equal(
    manifest.action?.default_popup,
    "popup.html",
    "The extension popup is missing from the package",
  );
  assertArchiveFile(files, manifest.action.default_popup, "popup");
  assertArchiveFile(files, manifest.background?.service_worker, "service worker");

  assert.equal(
    manifest.content_scripts?.length,
    1,
    "Expected exactly one content script declaration",
  );
  const contentScript = manifest.content_scripts[0];
  assertExactSet(contentScript.matches, messagingHosts, "content script matches");
  assert.ok(
    contentScript.js?.length > 0,
    "The content script declaration must include JavaScript",
  );
  for (const file of [...contentScript.js, ...(contentScript.css ?? [])]) {
    assertArchiveFile(files, file, "content script asset");
  }

  verifyIconDeclaration(manifest.icons, files, "manifest icons");
  verifyIconDeclaration(manifest.action.default_icon, files, "action icons");
  verifyContentSecurityPolicy(manifest);
}

function assertExactSet(actual, expected, label) {
  assert.ok(Array.isArray(actual), `${label} must be an array`);
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    `${label} must contain only the approved values`,
  );
}

function assertArchiveFile(files, path, label) {
  assert.equal(typeof path, "string", `The ${label} path is missing`);
  assert.ok(files.has(path), `The ZIP archive is missing ${label}: ${path}`);
}

function verifyIconDeclaration(icons, files, label) {
  assert.ok(icons && typeof icons === "object", `${label} are missing`);
  assert.deepEqual(
    Object.keys(icons).sort(),
    [...iconSizes].sort(),
    `${label} must declare exactly 16, 32, 48, and 128 pixel icons`,
  );
  for (const size of iconSizes) {
    const path = icons[size];
    assert.match(path, /\.png$/i, `${label} ${size} must be a PNG`);
    const bytes = files.get(path);
    assert.ok(bytes, `The ZIP archive is missing ${label} ${size}: ${path}`);
    assertPngDimensions(bytes, Number(size), `${label} ${size}`);
  }
}

function assertPngDimensions(bytes, size, label) {
  assert.ok(
    bytes.length >= 24 && bytes.subarray(0, 8).equals(pngSignature),
    `${label} is not a valid PNG`,
  );
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR", `${label} has no IHDR`);
  assert.equal(bytes.readUInt32BE(16), size, `${label} has the wrong width`);
  assert.equal(bytes.readUInt32BE(20), size, `${label} has the wrong height`);
}

function verifyContentSecurityPolicy(manifest) {
  assert.ok(!manifest.sandbox, "Sandbox pages are not allowed in the extension");
  const policy = manifest.content_security_policy;
  if (policy === undefined) return;

  assert.equal(
    typeof policy,
    "object",
    "Manifest V3 content_security_policy must be an object",
  );
  assert.ok(!policy.sandbox, "A sandbox CSP is not allowed in the extension");
  assert.deepEqual(
    Object.keys(policy),
    ["extension_pages"],
    "Only the extension_pages CSP may be declared",
  );
  const normalized = policy.extension_pages
    ?.trim()
    .replace(/\s+/g, " ")
    .replace(/;\s*/g, "; ")
    .replace(/; $/, "");
  assert.equal(
    normalized,
    "script-src 'self'; object-src 'self'",
    "Extension CSP must allow scripts and objects from 'self' only",
  );
}

function verifyExecutableContent(files) {
  for (const [name, bytes] of files) {
    const extension = extname(name).toLowerCase();
    if (extension !== ".js" && extension !== ".html") continue;
    const source = bytes.toString("utf8");

    assert.ok(!/\beval\s*\(/.test(source), `Forbidden eval() found in ${name}`);
    assert.ok(
      !/\bnew\s+Function\s*\(/.test(source),
      `Forbidden new Function() found in ${name}`,
    );
    assert.ok(
      !/\bimportScripts\s*\(\s*["']https?:\/\//i.test(source),
      `Remote importScripts() found in ${name}`,
    );
    assert.ok(
      !/\bimport\s*\(\s*["']https?:\/\//i.test(source),
      `Remote dynamic import found in ${name}`,
    );

    if (extension !== ".html") continue;
    assert.ok(
      !/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(source),
      `Remote script found in ${name}`,
    );
    assert.ok(!/javascript\s*:/i.test(source), `javascript: URL found in ${name}`);

    for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      assert.ok(
        /\bsrc\s*=/.test(match[1]) || match[2].trim() === "",
        `Inline script found in ${name}`,
      );
    }
    for (const match of source.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      const reference = match[1];
      if (/^(?:https?:)?\/\//i.test(reference)) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(name), reference));
      assertArchiveFile(files, resolved, `script referenced by ${name}`);
    }
  }
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
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    assert.notEqual(
      claims.role,
      "service_role",
      "A service-role JWT must never be embedded in the extension",
    );
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
  }
}

function collectText(files) {
  return [...files]
    .filter(([name]) => textExtensions.has(extname(name).toLowerCase()))
    .map(([, bytes]) => bytes.toString("utf8"))
    .join("\n");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const args = process.argv.slice(2);
  const verifyAll = args.includes("--all");
  const browserArgument = args.indexOf("--browser");
  assert.ok(
    !(verifyAll && browserArgument >= 0),
    "Use either --all or --browser, not both",
  );
  if (verifyAll) {
    const archives = verifyStorePackages();
    for (const browser of supportedBrowsers) {
      console.log(`Verified ${browserLabel(browser)} extension package: ${archives[browser]}`);
    }
  } else {
    const browser = browserArgument >= 0 ? args[browserArgument + 1] : "chrome";
    assert.ok(browser, "--browser requires chrome or edge");
    const archive = verifyExtensionPackage({ browser });
    console.log(`Verified ${browserLabel(browser)} extension package: ${archive}`);
  }
}
