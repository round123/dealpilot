import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BunSqliteSnapshotProvider,
  MigrationExtractionError,
  extractV1MigrationBundle,
  type V1ReadOnlySnapshot,
  type V1SnapshotProvider,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Bun SQLite read-only snapshot adapter", () => {
  test("extracts through a serialized read-only snapshot without touching V1", () => {
    const sourcePath = createCompleteDatabase();
    const before = sourceState(sourcePath);

    const artifact = extractV1MigrationBundle(
      new BunSqliteSnapshotProvider(sourcePath),
    );

    expect(sourceState(sourcePath)).toEqual(before);
    expect(artifact.bundle.preflight).toMatchObject({
      integrity: "ok",
      foreign_key_violations: 0,
    });
    expect(artifact.bundle.user_preferences).toMatchObject({
      locale: "zh-CN",
      theme: "light",
    });
    const snapshot = Database.deserialize(artifact.snapshot_bytes, {
      readonly: true,
    });
    expect(() => snapshot.exec("CREATE TABLE forbidden (id INTEGER)")).toThrow(
      /readonly/i,
    );
    snapshot.close(false);
  });

  test("keeps source bytes and mtime unchanged after preflight failure", () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = join(directory, "invalid.db");
    const database = new Database(sourcePath, { create: true });
    database.exec(
      "CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
    );
    database.close(false);
    const before = sourceState(sourcePath);

    expect(() =>
      extractV1MigrationBundle(new BunSqliteSnapshotProvider(sourcePath)),
    ).toThrow(MigrationExtractionError);
    expect(sourceState(sourcePath)).toEqual(before);
  });

  test("keeps source bytes and mtime unchanged when extraction is cancelled", () => {
    const sourcePath = createCompleteDatabase();
    const before = sourceState(sourcePath);
    const controller = new AbortController();
    const provider = abortAfterFirstTable(
      new BunSqliteSnapshotProvider(sourcePath),
      controller,
    );

    expect(() =>
      extractV1MigrationBundle(provider, { signal: controller.signal }),
    ).toThrow(MigrationExtractionError);
    expect(sourceState(sourcePath)).toEqual(before);
  });
});

function abortAfterFirstTable(
  provider: V1SnapshotProvider,
  controller: AbortController,
): V1SnapshotProvider {
  return {
    capture() {
      const source = provider.capture();
      let reads = 0;
      const snapshot: V1ReadOnlySnapshot = {
        source_fingerprint: source.source_fingerprint,
        snapshot_sha256: source.snapshot_sha256,
        snapshot_bytes: source.snapshot_bytes,
        preflight: () => source.preflight(),
        readTable(table) {
          const rows = source.readTable(table);
          reads += 1;
          if (reads === 1) controller.abort();
          return rows;
        },
        verifySourceUnchanged: () => source.verifySourceUnchanged(),
        close: () => source.close(),
      };
      return snapshot;
    },
  };
}

function createCompleteDatabase(): string {
  const directory = makeTemporaryDirectory();
  const sourcePath = join(directory, "dealpilot.db");
  const database = new Database(sourcePath, { create: true });
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE customers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT, country TEXT,
      source TEXT, grade TEXT NOT NULL, status TEXT NOT NULL, deleted_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE contacts (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, name TEXT NOT NULL,
      title TEXT, email TEXT, phone TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE social_accounts (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, contact_id TEXT,
      platform TEXT NOT NULL, raw_identifier TEXT NOT NULL,
      normalized_identifier TEXT NOT NULL, manually_bound INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, name TEXT NOT NULL,
      currency TEXT NOT NULL, amount REAL, probability INTEGER,
      expected_close_date TEXT, stage TEXT NOT NULL, grade TEXT NOT NULL,
      closed_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE follow_ups (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, project_id TEXT,
      type TEXT NOT NULL, note TEXT, message_body TEXT,
      message_direction TEXT, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE reminders (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, project_id TEXT,
      type TEXT NOT NULL, status TEXT NOT NULL, due_at TEXT NOT NULL,
      priority TEXT NOT NULL, last_notified_at TEXT, delivered_at TEXT,
      handled_at TEXT, completed_at TEXT, snooze_until TEXT, resolution TEXT,
      pause_reason TEXT, reevaluate_at TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE risks (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, description TEXT NOT NULL,
      severity TEXT NOT NULL, status TEXT NOT NULL, handled_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE milestones (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
      date TEXT NOT NULL, completed INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE import_jobs (
      id TEXT PRIMARY KEY, file_name TEXT, total_rows INTEGER, valid_rows INTEGER,
      failed_rows INTEGER, duplicate_count INTEGER, status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE local_events (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, entity_type TEXT,
      entity_id TEXT, metadata TEXT, occurred_at TEXT NOT NULL
    );
    CREATE TABLE settings (
      id INTEGER PRIMARY KEY, last_backup_at TEXT, auto_start INTEGER,
      minimize_to_tray INTEGER, backup_reminder_days INTEGER,
      locale TEXT NOT NULL, theme TEXT NOT NULL
    );
    INSERT INTO settings (id, locale, theme) VALUES (1, 'zh-CN', 'light');
  `);
  database.close(false);
  return sourcePath;
}

function sourceState(path: string) {
  const stat = statSync(path);
  return {
    bytes: readFileSync(path).toString("base64"),
    mtime_ms: stat.mtimeMs,
    size_bytes: stat.size,
  };
}

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "dealpilot-migration-"));
  temporaryDirectories.push(directory);
  return directory;
}
