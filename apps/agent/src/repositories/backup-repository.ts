import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config/config";
import { closeDatabase, getRawDb, reopenDatabase } from "../db/client";

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
  let currentMoved = false;
  try {
    const { Database } = await import("bun:sqlite");
    const restored = new Database(path, { readonly: true });
    const integrity = restored.query("PRAGMA integrity_check").get() as { integrity_check: string };
    if (integrity.integrity_check !== "ok") {
      restored.close();
      throw new Error(`Backup database integrity check failed: ${integrity.integrity_check}`);
    }
    let rowsRestored = 0;
    for (const table of [
      "customers", "contacts", "social_accounts", "projects", "follow_ups",
      "reminders", "risks", "milestones", "import_jobs", "local_events", "settings",
    ]) {
      try {
        const count = restored.query(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
        rowsRestored += count.c;
      } catch {
        // Older compatible backups can omit newer tables.
      }
    }
    restored.close();

    closeDatabase();
    try {
      renameSync(config.dbPath, rollbackPath);
      currentMoved = true;
      renameSync(path, config.dbPath);
      removeTemporaryFile(`${config.dbPath}-wal`);
      removeTemporaryFile(`${config.dbPath}-shm`);
      reopenDatabase();
      removeTemporaryFile(rollbackPath);
    } catch (error) {
      closeDatabase();
      if (currentMoved && existsSync(rollbackPath)) {
        removeTemporaryFile(config.dbPath);
        renameSync(rollbackPath, config.dbPath);
      }
      reopenDatabase();
      throw error;
    }
    return rowsRestored;
  } finally {
    removeTemporaryFile(path);
  }
}
