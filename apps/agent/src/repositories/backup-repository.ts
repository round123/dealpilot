import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config/config";
import { closeDatabase, getRawDb, reopenDatabase } from "../db/client";
import { resolveMigrationsFolder } from "../db/migrate";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

function removeTemporaryFile(path: string) {
  try {
    unlinkSync(path);
  } catch {
    // Best-effort cleanup after SQLite/file operations.
  }
}

export function createDatabaseSnapshot(): Buffer {
  const path = join(config.dataDir, `backup-temp-${crypto.randomUUID()}.db`);
  const escapedPath = path.replace(/'/g, "''");
  try {
    getRawDb().exec(`VACUUM INTO '${escapedPath}';`);
    return readFileSync(path);
  } finally {
    removeTemporaryFile(path);
  }
}

export async function replaceDatabaseFromBuffer(database: Buffer) {
  const path = join(config.dataDir, `restore-temp-${crypto.randomUUID()}.db`);
  const rollbackPath = join(config.dataDir, `restore-rollback-${crypto.randomUUID()}.db`);
  writeFileSync(path, database);
  const hadCurrentDatabase = existsSync(config.dbPath);
  let currentMoved = false;
  let restoredInstalled = false;
  try {
    const rowsRestored = prepareRestoreCandidate(path);

    try {
      closeDatabase();
      if (hadCurrentDatabase) {
        renameWithBusyRetry(config.dbPath, rollbackPath);
        currentMoved = true;
      }
      removeFileWithBusyRetry(`${config.dbPath}-wal`);
      removeFileWithBusyRetry(`${config.dbPath}-shm`);
      renameWithBusyRetry(path, config.dbPath);
      restoredInstalled = true;
      reopenDatabase();
      assertDatabaseIntegrity(getRawDb(), "Restored database");
      removeTemporaryFile(rollbackPath);
    } catch (error) {
      let rollbackError: unknown;
      try {
        closeDatabaseAfterFailedSwap();
        if (restoredInstalled) removeFileWithBusyRetry(config.dbPath);
        removeFileWithBusyRetry(`${config.dbPath}-wal`);
        removeFileWithBusyRetry(`${config.dbPath}-shm`);
        if (currentMoved && existsSync(rollbackPath)) {
          renameWithBusyRetry(rollbackPath, config.dbPath);
        }
        if (hadCurrentDatabase) reopenDatabase();
      } catch (caughtRollbackError) {
        rollbackError = caughtRollbackError;
      }
      if (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Database restore failed and the original database could not be restored",
        );
      }
      throw error;
    }
    return rowsRestored;
  } finally {
    removeTemporaryFile(path);
  }
}

const LOCAL_TABLES = [
  "customers",
  "contacts",
  "social_accounts",
  "projects",
  "follow_ups",
  "reminders",
  "risks",
  "milestones",
  "import_jobs",
  "local_events",
  "settings",
] as const;

const RESTORE_SIGNATURE_TABLES = ["customers", "settings"] as const;

function prepareRestoreCandidate(path: string): number {
  const restored = new Database(path);
  try {
    assertCompatibleBackup(restored);
    restored.exec("PRAGMA foreign_keys = ON;");
    migrate(drizzle(restored), { migrationsFolder: resolveMigrationsFolder() });
    assertRequiredTables(restored);
    assertDatabaseIntegrity(restored, "Backup database");
    return countRows(restored);
  } finally {
    restored.close();
  }
}

function assertCompatibleBackup(database: Database): void {
  for (const table of RESTORE_SIGNATURE_TABLES) {
    if (!hasTable(database, table)) {
      throw new Error(`Backup database is incompatible: missing ${table} table`);
    }
  }
}

function assertRequiredTables(database: Database): void {
  for (const table of LOCAL_TABLES) {
    if (!hasTable(database, table)) {
      throw new Error(`Backup database is incompatible after migration: missing ${table} table`);
    }
  }
}

function hasTable(database: Database, table: string): boolean {
  return Boolean(database.query(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table));
}

function assertDatabaseIntegrity(database: Database, label: string): void {
  const integrity = database.query("PRAGMA integrity_check").get() as {
    integrity_check: string;
  };
  if (integrity.integrity_check !== "ok") {
    throw new Error(`${label} integrity check failed: ${integrity.integrity_check}`);
  }
  if (database.query("PRAGMA foreign_key_check").get()) {
    throw new Error(`${label} foreign key check failed`);
  }
}

function countRows(database: Database): number {
  let total = 0;
  for (const table of LOCAL_TABLES) {
    const row = database.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
      count: number;
    };
    total += row.count;
  }
  return total;
}

/**
 * Replaces the current database with a migrated empty database. The old file
 * is restored if any swap or deletion step fails.
 */
export function resetLocalDatabase(options: {
  beforeDeleteOldDatabase?: () => void;
  afterRollback?: () => void;
} = {}): number {
  const freshPath = join(config.dataDir, `clear-fresh-${crypto.randomUUID()}.db`);
  const rollbackPath = join(config.dataDir, `clear-rollback-${crypto.randomUUID()}.db`);
  const deletedRecords = countLocalRows();
  createFreshDatabase(freshPath);

  let currentMoved = false;
  let freshInstalled = false;
  try {
    closeDatabase();
    renameWithBusyRetry(config.dbPath, rollbackPath);
    currentMoved = true;
    removeFileStrict(`${config.dbPath}-wal`);
    removeFileStrict(`${config.dbPath}-shm`);
    renameWithBusyRetry(freshPath, config.dbPath);
    freshInstalled = true;
    reopenDatabase();
    options.beforeDeleteOldDatabase?.();
    removeFileStrict(rollbackPath);
    return deletedRecords;
  } catch (error) {
    let rollbackError: unknown;
    try {
      closeDatabaseAfterFailedSwap();
      if (freshInstalled) removeFileWithBusyRetry(config.dbPath);
      removeFileWithBusyRetry(`${config.dbPath}-wal`);
      removeFileWithBusyRetry(`${config.dbPath}-shm`);
      if (currentMoved && existsSync(rollbackPath)) {
        renameWithBusyRetry(rollbackPath, config.dbPath);
      }
      reopenDatabase();
      options.afterRollback?.();
    } catch (caughtRollbackError) {
      rollbackError = caughtRollbackError;
    }
    if (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Local data reset failed and the original database could not be restored",
      );
    }
    throw error;
  } finally {
    removeTemporaryFile(freshPath);
  }
}

function countLocalRows(): number {
  let total = 0;
  for (const table of LOCAL_TABLES) {
    const row = getRawDb().query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    total += row.count;
  }
  return total;
}

function createFreshDatabase(path: string): void {
  const raw = new Database(path, { create: true });
  try {
    raw.exec("PRAGMA foreign_keys = ON;");
    migrate(drizzle(raw), { migrationsFolder: resolveMigrationsFolder() });
    raw.exec("INSERT OR IGNORE INTO settings (id, backup_reminder_days) VALUES (1, 7);");
    assertRequiredTables(raw);
    assertDatabaseIntegrity(raw, "Fresh database");
  } finally {
    raw.close();
  }
}

function removeFileStrict(path: string): void {
  removeFileWithBusyRetry(path);
}

function removeFileWithBusyRetry(path: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      unlinkSync(path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return;
      if (attempt >= 7 || (code !== "EBUSY" && code !== "EPERM")) throw error;
      waitBeforeFileRetry();
    }
  }
}

function renameWithBusyRetry(source: string, destination: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 7 || (code !== "EBUSY" && code !== "EPERM")) throw error;
      waitBeforeFileRetry();
    }
  }
}

function waitBeforeFileRetry(): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
}

function closeDatabaseAfterFailedSwap(): void {
  try {
    closeDatabase();
  } catch {
    // closeDatabase releases all references in its finally path, even when
    // checkpointing reports an error.
  }
}
