/**
 * DealPilot 数据库迁移
 * 使用 Drizzle migrations，启动时自动执行
 *
 * migrations 目录解析：
 * - 已编译 exe：与 exe 同级（安装包随 exe 装入 $INSTDIR/migrations）
 * - 开发态：cwd/migrations
 * - 环境变量 DEALPILOT_MIGRATIONS_DIR 优先（测试用）
 *
 * 升级安全：有待执行 migration 且数据库已有业务结构时，先创建恢复点。
 * migration 或完整性校验失败会恢复原数据库并重新抛错，禁止带病启动。
 */

import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Database } from "bun:sqlite";
import { closeDatabase, getDb, getRawDb, reopenDatabase } from "./client";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { config } from "../config/config";

const RECOVERY_DIRECTORY = join(config.dataDir, "recovery");
const RECOVERY_FILE_PATTERN = /^migration-recovery-.*\.db$/;

export interface MigrationResult {
  migrated: boolean;
  recoveryPoint?: string;
}

/** migrations 目录：编译 exe 同级、开发态 cwd、或环境变量 */
export function resolveMigrationsFolder(): string {
  if (process.env.DEALPILOT_MIGRATIONS_DIR) {
    return resolve(process.env.DEALPILOT_MIGRATIONS_DIR);
  }
  if (basename(process.execPath).toLowerCase() === "dealpilot-agent.exe") {
    return join(dirname(process.execPath), "migrations");
  }
  return resolve(process.cwd(), "migrations");
}

/**
 * 执行数据库迁移
 * migrations 目录由 drizzle-kit generate 生成
 */
export function runMigrations(): MigrationResult {
  const migrationsFolder = resolveMigrationsFolder();
  const migrations = readMigrationFiles({ migrationsFolder });
  const rawDb = getRawDb();
  const pending = hasPendingMigrations(
    rawDb,
    migrations.map(({ folderMillis }) => folderMillis),
  );
  if (!pending) return { migrated: false };

  const recoveryPoint = hasRecoverableSchema(rawDb)
    ? createMigrationRecoveryPoint(rawDb)
    : undefined;

  try {
    migrate(getDb(), { migrationsFolder });
    assertDatabaseIntegrity(getRawDb());
    if (recoveryPoint) pruneOldRecoveryPoints(recoveryPoint);
    return { migrated: true, recoveryPoint };
  } catch (migrationError) {
    if (!recoveryPoint) throw migrationError;
    try {
      restoreMigrationRecoveryPoint(recoveryPoint);
    } catch (restoreError) {
      throw new AggregateError(
        [migrationError, restoreError],
        "Database migration failed and the recovery point could not be restored",
      );
    }
    throw migrationError;
  }
}

function hasPendingMigrations(
  rawDb: ReturnType<typeof getRawDb>,
  migrationTimestamps: number[],
): boolean {
  if (migrationTimestamps.length === 0) return false;
  const hasJournal = rawDb
    .query(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();
  if (!hasJournal) return true;
  const latest = rawDb
    .query(
      "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    )
    .get() as { created_at: number } | null;
  const latestAvailable = Math.max(...migrationTimestamps);
  return !latest || Number(latest.created_at) < latestAvailable;
}

function hasRecoverableSchema(rawDb: ReturnType<typeof getRawDb>): boolean {
  const row = rawDb
    .query(
      `SELECT COUNT(*) AS count FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name <> '__drizzle_migrations'`,
    )
    .get() as { count: number };
  return row.count > 0;
}

function createMigrationRecoveryPoint(
  rawDb: ReturnType<typeof getRawDb>,
): string {
  mkdirSync(RECOVERY_DIRECTORY, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(
    RECOVERY_DIRECTORY,
    `migration-recovery-${timestamp}-${crypto.randomUUID()}.db`,
  );
  rawDb.exec(`VACUUM INTO '${path.replace(/'/g, "''")}';`);
  assertDatabaseFileIntegrity(path);
  return path;
}

function assertDatabaseIntegrity(rawDb: ReturnType<typeof getRawDb>): void {
  const integrity = rawDb.query("PRAGMA integrity_check").get() as {
    integrity_check: string;
  };
  if (integrity.integrity_check !== "ok") {
    throw new Error(
      `Database integrity check failed: ${integrity.integrity_check}`,
    );
  }
  const foreignKeyViolation = rawDb.query("PRAGMA foreign_key_check").get();
  if (foreignKeyViolation) {
    throw new Error("Database foreign key check failed after migration");
  }
}

function assertDatabaseFileIntegrity(path: string): void {
  const database = new Database(path, { readonly: true });
  try {
    assertDatabaseIntegrity(database);
  } finally {
    database.close();
  }
}

function restoreMigrationRecoveryPoint(recoveryPoint: string): void {
  assertDatabaseFileIntegrity(recoveryPoint);
  const restorePath = join(
    config.dataDir,
    `migration-restore-${crypto.randomUUID()}.db`,
  );
  const failedPath = join(
    config.dataDir,
    `migration-failed-${crypto.randomUUID()}.db`,
  );
  copyFileSync(recoveryPoint, restorePath);

  let currentMoved = false;
  let recoveryInstalled = false;
  try {
    try {
      closeDatabase();
    } catch (error) {
      console.warn(
        "[migrate] Database checkpoint failed before restore:",
        error,
      );
    }
    if (existsSync(config.dbPath)) {
      renameWithBusyRetry(config.dbPath, failedPath);
      currentMoved = true;
    }
    removeFileIfPresent(`${config.dbPath}-wal`);
    removeFileIfPresent(`${config.dbPath}-shm`);
    renameWithBusyRetry(restorePath, config.dbPath);
    recoveryInstalled = true;
    reopenDatabase();
    assertDatabaseIntegrity(getRawDb());
    removeFileIfPresent(failedPath);
  } catch (error) {
    try {
      closeDatabase();
    } catch {
      // The handle is released in closeDatabase's finally path.
    }
    if (recoveryInstalled) removeFileIfPresent(config.dbPath);
    if (currentMoved && existsSync(failedPath)) {
      renameWithBusyRetry(failedPath, config.dbPath);
    }
    reopenDatabase();
    throw error;
  } finally {
    removeFileIfPresent(restorePath);
  }
}

function pruneOldRecoveryPoints(keepPath: string): void {
  if (!existsSync(RECOVERY_DIRECTORY)) return;
  for (const file of readdirSync(RECOVERY_DIRECTORY)) {
    const path = join(RECOVERY_DIRECTORY, file);
    if (
      path !== keepPath &&
      RECOVERY_FILE_PATTERN.test(file) &&
      statSync(path).isFile()
    ) {
      removeFileIfPresent(path);
    }
  }
}

function removeFileIfPresent(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

function renameWithBusyRetry(source: string, destination: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 7 || (code !== "EBUSY" && code !== "EPERM")) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}

/**
 * 确保数据库表存在（幂等 fallback）
 * 优先读取 migrations/*.sql（drizzle 生成），注入 IF NOT EXISTS 后逐条执行，
 * 保证业务表存在（即使库中已有部分表也不报错）。目录缺失时仅保证 settings 表。
 */
export function ensureSchema(): void {
  const rawDb = getRawDb();
  const folder = resolveMigrationsFolder();

  try {
    if (existsSync(folder)) {
      const files = readdirSync(folder)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const file of files) {
        const sql = readFileSync(join(folder, file), "utf-8");
        execSchemaSql(rawDb, sql);
      }
      // 默认设置行
      rawDb.exec(`INSERT OR IGNORE INTO settings (id) VALUES (1);`);
      return;
    }
  } catch (err) {
    console.error("[migrate] schema push from .sql failed:", err);
  }

  // migrations 目录不存在：仅保证 settings 表（最小可用）
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_backup_at TEXT,
      auto_start INTEGER NOT NULL DEFAULT 0,
      minimize_to_tray INTEGER NOT NULL DEFAULT 1,
      backup_reminder_days INTEGER NOT NULL DEFAULT 7,
      locale TEXT NOT NULL DEFAULT 'zh-CN',
      theme TEXT NOT NULL DEFAULT 'light'
    );
  `);
  rawDb.exec(`INSERT OR IGNORE INTO settings (id) VALUES (1);`);
  console.warn(
    "[migrate] no migrations folder available; created settings table only.",
  );
}

/**
 * 执行 schema SQL：按 --> statement-breakpoint 分割，注入 IF NOT EXISTS 使其幂等
 */
function execSchemaSql(rawDb: ReturnType<typeof getRawDb>, sql: string): void {
  const statements = sql.split("--> statement-breakpoint");
  for (const stmt of statements) {
    const s = stmt.trim();
    if (!s) continue;
    const idempotent = s
      .replace(/\bCREATE UNIQUE INDEX\b/g, "CREATE UNIQUE INDEX IF NOT EXISTS")
      .replace(/\bCREATE INDEX\b/g, "CREATE INDEX IF NOT EXISTS")
      .replace(/\bCREATE TABLE\b/g, "CREATE TABLE IF NOT EXISTS");
    try {
      rawDb.exec(idempotent);
    } catch (err) {
      // 单条失败（如表/索引已存在等）不中断整体建表
      console.warn(
        "[migrate] schema statement skipped:",
        (err as Error).message,
      );
    }
  }
}
