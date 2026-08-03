import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const VERSION = 1;

async function digest(file) {
  const value = await readFile(file);
  return {
    bytes: value.length,
    sha256: createHash("sha256").update(value).digest("hex"),
  };
}

export async function createManifest(directory, metadata = {}) {
  const files = {};
  for (const name of ["database.sql", "storage/storage-manifest.json"])
    files[name] = await digest(path.join(directory, name));
  const manifest = {
    schema_version: VERSION,
    created_at: new Date().toISOString(),
    source_commit: metadata.sourceCommit || process.env.GITHUB_SHA || "local",
    source_run_id: metadata.sourceRunId || process.env.GITHUB_RUN_ID || "local",
    files,
  };
  await writeFile(
    path.join(directory, "backup-manifest.json"),
    `${JSON.stringify(manifest)}\n`,
    { mode: 0o600 },
  );
  return manifest;
}

export async function verifyManifest(directory) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "backup-manifest.json"), "utf8"),
  );
  if (
    manifest.schema_version !== VERSION ||
    !manifest.files ||
    typeof manifest.source_commit !== "string"
  ) {
    throw new Error("Backup manifest is incompatible");
  }
  for (const name of ["database.sql", "storage/storage-manifest.json"]) {
    const expected = manifest.files[name];
    const actual = await digest(path.join(directory, name));
    if (
      !expected ||
      expected.bytes !== actual.bytes ||
      expected.sha256 !== actual.sha256
    ) {
      throw new Error(`Backup integrity verification failed for ${name}`);
    }
  }
  return manifest;
}

async function main() {
  const [command, directory] = process.argv.slice(2);
  if (!directory || !["create", "verify"].includes(command)) {
    throw new Error(
      "Usage: disaster-recovery-manifest.mjs <create|verify> <directory>",
    );
  }
  if (command === "create") await createManifest(directory);
  else await verifyManifest(directory);
  console.log(`Disaster-recovery manifest ${command} completed.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Manifest command failed",
    );
    process.exitCode = 1;
  });
}
