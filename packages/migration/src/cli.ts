import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { BunSqliteSnapshotProvider } from "./bun-sqlite-source.js";
import { MigrationExtractionError } from "./domain.js";
import { extractV1MigrationBundle } from "./extract-v1-bundle.js";
import { stableJson } from "./stable-json.js";

export function runMigrationExtractorCli(args = process.argv.slice(2)): number {
  const [sourcePath, outputDirectory] = args;
  if (!sourcePath || !outputDirectory) {
    console.error("Usage: bun src/cli.ts <v1-sqlite-path> <output-directory>");
    return 2;
  }

  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  try {
    const artifact = extractV1MigrationBundle(
      new BunSqliteSnapshotProvider(sourcePath),
    );
    const suffix = artifact.bundle.bundle_sha256.slice(0, 16);
    const snapshotPath = resolve(output, `dealpilot-v1-${suffix}.snapshot.db`);
    const bundlePath = resolve(output, `dealpilot-v1-${suffix}.bundle.json`);
    writeFileSync(snapshotPath, artifact.snapshot_bytes, { mode: 0o444 });
    chmodSync(snapshotPath, 0o444);
    writeFileSync(bundlePath, artifact.bundle_json, "utf8");
    console.log(
      stableJson({
        bundle_path: bundlePath,
        snapshot_path: snapshotPath,
        bundle_sha256: artifact.bundle.bundle_sha256,
        idempotency_key: artifact.bundle.idempotency_key,
      }),
    );
    return 0;
  } catch (error) {
    const report =
      error instanceof MigrationExtractionError
        ? { error: error.name, message: error.message, issues: error.issues }
        : {
            error: error instanceof Error ? error.name : "UnknownError",
            message:
              error instanceof Error
                ? error.message
                : "Migration extraction failed",
            issues: [],
          };
    const errorPath = resolve(output, "dealpilot-v1-migration-errors.json");
    writeFileSync(errorPath, `${stableJson(report)}\n`, "utf8");
    console.error(
      `Migration extraction failed; report written to ${errorPath}`,
    );
    return 1;
  }
}

if (import.meta.main) process.exitCode = runMigrationExtractorCli();
