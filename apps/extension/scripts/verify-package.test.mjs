import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import AdmZip from "adm-zip";

import {
  verifyExtensionPackage,
  verifyStorePackages,
} from "./verify-package.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const iconDirectory = resolve(scriptDirectory, "../public/icon");
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

test("accepts a configured Manifest V3 Edge archive", () => {
  const outputDirectory = createPackageFixture({ browser: "edge" });

  const archive = verifyExtensionPackage({
    outputDirectory,
    environment,
    browser: "edge",
  });

  assert.equal(archive, join(outputDirectory, "dealpilot-0.1.0-edge.zip"));
});

test("verifies Chrome and Edge store candidates together", () => {
  const outputDirectory = createOutputDirectory();
  createPackageFixture({ outputDirectory, browser: "chrome" });
  createPackageFixture({ outputDirectory, browser: "edge" });

  const archives = verifyStorePackages({ outputDirectory, environment });

  assert.deepEqual(archives, {
    chrome: join(outputDirectory, "dealpilot-0.1.0-chrome.zip"),
    edge: join(outputDirectory, "dealpilot-0.1.0-edge.zip"),
  });
});

test("rejects a ZIP filename whose version differs from package.json", () => {
  const outputDirectory = createPackageFixture();
  renameSync(
    join(outputDirectory, "dealpilot-0.1.0-chrome.zip"),
    join(outputDirectory, "dealpilot-0.2.0-chrome.zip"),
  );

  assert.throws(
    () => verifyExtensionPackage({ outputDirectory, environment }),
    /exactly one Chrome 0\.1\.0 package archive/,
  );
});

test("rejects a file that only contains the ZIP signature", () => {
  const outputDirectory = createOutputDirectory();
  writeFileSync(join(outputDirectory, "dealpilot-0.1.0-chrome.zip"), "PK");

  assert.throws(
    () => verifyExtensionPackage({ outputDirectory, environment }),
    /not a valid ZIP archive|archive is empty/,
  );
});

test("rejects an archive entry whose compressed data fails CRC validation", () => {
  const outputDirectory = createPackageFixture();
  const archive = join(outputDirectory, "dealpilot-0.1.0-chrome.zip");
  corruptZipEntry(archive, "background.js");

  assert.throws(
    () => verifyExtensionPackage({ outputDirectory, environment }),
    /CRC|decompression validation/,
  );
});

test("rejects service-role credentials", () => {
  const unsafeEnvironment = {
    ...environment,
    VITE_SB_PUBLISHABLE_KEY: "sb_secret_service_role-key",
  };
  const outputDirectory = createPackageFixture({ values: unsafeEnvironment });

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
    /host_permissions/,
  );
});

test("rejects a manifest version that differs from package.json", () => {
  const outputDirectory = createPackageFixture({
    mutateManifest: (manifest) => {
      manifest.version = "0.2.0";
    },
  });

  assert.throws(
    () => verifyExtensionPackage({ outputDirectory, environment }),
    /Manifest version must match/,
  );
});

test("rejects unapproved browser permissions", () => {
  const outputDirectory = createPackageFixture({
    mutateManifest: (manifest) => {
      manifest.permissions.push("activeTab");
    },
  });

  assert.throws(
    () => verifyExtensionPackage({ outputDirectory, environment }),
    /permissions must contain only/,
  );
});

test("rejects broad host and content-script matches", () => {
  for (const field of ["host_permissions", "content_scripts"]) {
    const outputDirectory = createPackageFixture({
      mutateManifest: (manifest) => {
        if (field === "host_permissions") manifest.host_permissions = ["<all_urls>"];
        else manifest.content_scripts[0].matches = ["<all_urls>"];
      },
    });

    assert.throws(
      () => verifyExtensionPackage({ outputDirectory, environment }),
      /must contain only the approved values/,
    );
  }
});

test("rejects a package with an incomplete icon declaration", () => {
  const outputDirectory = createPackageFixture({
    mutateManifest: (manifest) => {
      delete manifest.icons["48"];
    },
  });

  assert.throws(
    () => verifyExtensionPackage({ outputDirectory, environment }),
    /must declare exactly/,
  );
});

test("rejects a declared icon that is missing from the ZIP", () => {
  const outputDirectory = createPackageFixture({
    mutateFiles: (files) => {
      files.delete("icon/48.png");
    },
  });

  assert.throws(
    () => verifyExtensionPackage({ outputDirectory, environment }),
    /missing manifest icons 48/,
  );
});

test("rejects a relaxed extension CSP", () => {
  const outputDirectory = createPackageFixture({
    mutateManifest: (manifest) => {
      manifest.content_security_policy = {
        extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'",
      };
    },
  });

  assert.throws(
    () => verifyExtensionPackage({ outputDirectory, environment }),
    /CSP must allow scripts and objects from 'self' only/,
  );
});

test("rejects a remotely loaded popup script", () => {
  const outputDirectory = createPackageFixture({
    mutateFiles: (files) => {
      files.set(
        "popup.html",
        Buffer.from('<script src="https://cdn.example.com/app.js"></script>'),
      );
    },
  });

  assert.throws(
    () => verifyExtensionPackage({ outputDirectory, environment }),
    /Remote script/,
  );
});

function createPackageFixture({
  values = environment,
  mutateManifest,
  mutateFiles,
  outputDirectory = createOutputDirectory(),
  browser = "chrome",
} = {}) {
  const iconPaths = Object.fromEntries(
    [16, 32, 48, 128].map((size) => [String(size), `icon/${size}.png`]),
  );
  const manifest = {
    manifest_version: 3,
    name: "DealPilot",
    version: "0.1.0",
    permissions: ["storage", "alarms"],
    host_permissions: [
      "https://web.whatsapp.com/*",
      "https://web.telegram.org/*",
      `${new URL(values.VITE_SUPABASE_URL).origin}/*`,
    ],
    action: {
      default_popup: "popup.html",
      default_icon: { ...iconPaths },
    },
    background: { service_worker: "background.js" },
    content_scripts: [
      {
        matches: [
          "https://web.whatsapp.com/*",
          "https://web.telegram.org/*",
        ],
        js: ["content-scripts/content.js"],
      },
    ],
    icons: { ...iconPaths },
  };
  mutateManifest?.(manifest);

  const files = new Map([
    ["manifest.json", Buffer.from(JSON.stringify(manifest))],
    ["background.js", Buffer.from(Object.values(values).join("\n"))],
    ["popup.html", Buffer.from('<script type="module" src="chunks/popup.js"></script>')],
    ["chunks/popup.js", Buffer.from("export {};")],
    ["content-scripts/content.js", Buffer.from("export {};")],
  ]);
  for (const size of [16, 32, 48, 128]) {
    files.set(`icon/${size}.png`, readFileSync(join(iconDirectory, `${size}.png`)));
  }
  mutateFiles?.(files);

  const zip = new AdmZip();
  for (const [name, bytes] of files) zip.addFile(name, bytes);
  zip.writeZip(join(outputDirectory, `dealpilot-0.1.0-${browser}.zip`));
  return outputDirectory;
}

function createOutputDirectory() {
  const outputDirectory = mkdtempSync(join(tmpdir(), "dealpilot-extension-"));
  temporaryDirectories.push(outputDirectory);
  return outputDirectory;
}

function corruptZipEntry(archive, targetName) {
  const bytes = readFileSync(archive);
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const fileNameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = bytes.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    const dataStart = nameStart + fileNameLength + extraLength;
    if (name === targetName) {
      assert.ok(compressedSize > 0, `${targetName} has no compressed data`);
      bytes[dataStart + Math.floor(compressedSize / 2)] ^= 0xff;
      writeFileSync(archive, bytes);
      return;
    }
    offset = dataStart + compressedSize;
  }
  assert.fail(`Could not find ${targetName} in ZIP local headers`);
}
