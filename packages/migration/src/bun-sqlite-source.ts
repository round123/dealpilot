import { Database } from "bun:sqlite";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  V1_TABLES,
  type JsonRecord,
  type SourceFileFingerprint,
  type SourceFingerprint,
  type SourcePreflight,
  type V1ReadOnlySnapshot,
  type V1SnapshotProvider,
  type V1TableName,
} from "./domain.js";
import { sha256, stableJson } from "./stable-json.js";

export class BunSqliteSnapshotProvider implements V1SnapshotProvider {
  readonly sourcePath: string;

  constructor(sourcePath: string) {
    this.sourcePath = resolve(sourcePath);
  }

  capture(): V1ReadOnlySnapshot {
    const before = fingerprintSqliteSource(this.sourcePath);
    const source = new Database(this.sourcePath, {
      readonly: true,
      strict: true,
    });
    let snapshotBytes: Buffer;
    try {
      snapshotBytes = source.serialize();
    } finally {
      source.close(false);
    }
    const after = fingerprintSqliteSource(this.sourcePath);
    if (after.aggregate_sha256 !== before.aggregate_sha256) {
      throw new Error(
        "The source SQLite files changed while the snapshot was being captured",
      );
    }
    return new BunSqliteReadOnlySnapshot(
      this.sourcePath,
      before,
      snapshotBytes,
    );
  }
}

class BunSqliteReadOnlySnapshot implements V1ReadOnlySnapshot {
  readonly snapshot_sha256: string;
  readonly snapshot_bytes: Uint8Array;
  readonly #database: Database;

  constructor(
    private readonly sourcePath: string,
    readonly source_fingerprint: SourceFingerprint,
    snapshotBytes: Uint8Array,
  ) {
    this.snapshot_bytes = new Uint8Array(snapshotBytes);
    this.snapshot_sha256 = sha256(this.snapshot_bytes);
    this.#database = Database.deserialize(this.snapshot_bytes, {
      readonly: true,
      strict: true,
    });
  }

  preflight(): SourcePreflight {
    const integrityMessages = this.#database
      .query("PRAGMA integrity_check")
      .all()
      .map((row) => String((row as Record<string, unknown>).integrity_check));
    const foreignKeyViolations = this.#database
      .query("PRAGMA foreign_key_check")
      .all().length;
    const tableRows = this.#database
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const tables: SourcePreflight["tables"] = {};
    for (const { name } of tableRows) {
      const escapedName = name.replaceAll('"', '""');
      const columns = this.#database
        .query(`PRAGMA table_info("${escapedName}")`)
        .all()
        .map((row) => String((row as Record<string, unknown>).name));
      tables[name] = { columns };
    }
    return {
      integrity:
        integrityMessages.length === 1 && integrityMessages[0] === "ok"
          ? "ok"
          : "failed",
      integrity_messages: integrityMessages,
      foreign_key_violations: foreignKeyViolations,
      tables,
    };
  }

  readTable(table: V1TableName): JsonRecord[] {
    if (!V1_TABLES.includes(table))
      throw new TypeError(`Unsupported V1 table: ${table}`);
    return this.#database
      .query(`SELECT * FROM "${table}" ORDER BY id`)
      .all() as JsonRecord[];
  }

  verifySourceUnchanged(): SourceFingerprint {
    return fingerprintSqliteSource(this.sourcePath);
  }

  close(): void {
    this.#database.close(false);
  }
}

export function fingerprintSqliteSource(sourcePath: string): SourceFingerprint {
  const resolvedPath = resolve(sourcePath);
  const files = [
    fingerprintFile("database", resolvedPath, true),
    fingerprintFile("wal", `${resolvedPath}-wal`, false),
    fingerprintFile("shm", `${resolvedPath}-shm`, false),
  ];
  return {
    algorithm: "sha256",
    aggregate_sha256: sha256(stableJson(files)),
    files,
  };
}

function fingerprintFile(
  role: SourceFileFingerprint["role"],
  path: string,
  required: boolean,
): SourceFileFingerprint {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) throw new TypeError(`${path} is not a file`);
    const bytes = readFileSync(path);
    return {
      role,
      present: true,
      size_bytes: bytes.byteLength,
      mtime_ms: stat.mtimeMs,
      sha256: sha256(bytes),
    };
  } catch (error) {
    if (required) throw error;
    return {
      role,
      present: false,
      size_bytes: 0,
      mtime_ms: 0,
      sha256: null,
    };
  }
}
