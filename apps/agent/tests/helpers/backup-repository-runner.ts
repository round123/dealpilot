import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { config } from "../../src/config/config";
import { closeDatabase, getRawDb } from "../../src/db/client";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import {
  createDatabaseSnapshot,
  replaceDatabaseFromBuffer,
} from "../../src/repositories/backup-repository";

runMigrations();
ensureSchema();

const now = "2026-07-31T08:00:00.000Z";
getRawDb().query(`
  INSERT INTO customers (id, name, grade, status, created_at, updated_at)
  VALUES (?, 'Restore marker', 'B', 'active', ?, ?)
`).run("00000000-0000-4000-8000-000000000001", now, now);
const validSnapshot = createDatabaseSnapshot();

closeDatabase();
removeIfPresent(config.dbPath);
removeIfPresent(`${config.dbPath}-wal`);
removeIfPresent(`${config.dbPath}-shm`);
const rowsRestoredWithoutCurrent = await replaceDatabaseFromBuffer(validSnapshot);
const restoredMarkerCount = customerCount();

const incompatiblePath = join(config.dataDir, "incompatible.db");
const incompatible = new Database(incompatiblePath, { create: true });
incompatible.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY);");
incompatible.close();
const incompatibleBuffer = readFileSync(incompatiblePath);
removeIfPresent(incompatiblePath);

const beforeIncompatible = customerCount();
const incompatibleError = await rejectionMessage(
  replaceDatabaseFromBuffer(incompatibleBuffer),
);
const afterIncompatible = customerCount();

const invalidForeignKeyPath = join(config.dataDir, "invalid-foreign-key.db");
writeFileSync(invalidForeignKeyPath, createDatabaseSnapshot());
const invalidForeignKey = new Database(invalidForeignKeyPath);
invalidForeignKey.exec("PRAGMA foreign_keys = OFF;");
invalidForeignKey.query(`
  INSERT INTO contacts (id, customer_id, name, created_at)
  VALUES (?, ?, 'Orphan contact', ?)
`).run(
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000099",
  now,
);
invalidForeignKey.close();
const invalidForeignKeyBuffer = readFileSync(invalidForeignKeyPath);
removeIfPresent(invalidForeignKeyPath);

const beforeForeignKeyFailure = customerCount();
const foreignKeyError = await rejectionMessage(
  replaceDatabaseFromBuffer(invalidForeignKeyBuffer),
);
const afterForeignKeyFailure = customerCount();

closeDatabase();
removeIfPresent(config.dbPath);
removeIfPresent(`${config.dbPath}-wal`);
removeIfPresent(`${config.dbPath}-shm`);
const noCurrentFailure = await rejectionMessage(
  replaceDatabaseFromBuffer(incompatibleBuffer),
);

console.log(JSON.stringify({
  no_current_success: {
    rows_restored: rowsRestoredWithoutCurrent,
    marker_count: restoredMarkerCount,
  },
  incompatible: {
    rejected: incompatibleError.includes("incompatible"),
    original_preserved: beforeIncompatible === afterIncompatible,
  },
  invalid_foreign_key: {
    rejected: foreignKeyError.includes("foreign key"),
    original_preserved: beforeForeignKeyFailure === afterForeignKeyFailure,
  },
  no_current_failure: {
    rejected: noCurrentFailure.includes("incompatible"),
    database_not_created: !existsSync(config.dbPath),
  },
}));

function customerCount(): number {
  return (getRawDb().query("SELECT COUNT(*) AS count FROM customers").get() as {
    count: number;
  }).count;
}

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

function removeIfPresent(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

process.exit(0);
