/**
 * DealPilot 数据库迁移
 * 使用 Drizzle migrations，启动时自动执行
 *
 * migrations 目录解析：
 * - 已编译 exe：与 exe 同级（安装包随 exe 装入 $INSTDIR/migrations）
 * - 开发态：cwd/migrations
 * - 环境变量 DEALPILOT_MIGRATIONS_DIR 优先（测试用）
 *
 * 鲁棒性：drizzle migrate 失败时（如部分 schema 残留），ensureSchema 读取
 * migrations/*.sql 注入 IF NOT EXISTS 幂等建表，保证业务表存在、调度器不崩。
 */

import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { getDb, getRawDb } from "./client";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** migrations 目录：编译 exe 同级、开发态 cwd、或环境变量 */
function resolveMigrationsFolder(): string {
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
export function runMigrations(): void {
  const migrationsFolder = resolveMigrationsFolder();
  try {
    migrate(getDb(), { migrationsFolder });
  } catch (err) {
    // migrations 目录缺失或迁移失败：用 ensureSchema 幂等兜底建表
    console.error("[migrate] Migration error, falling back to schema push:", err);
    ensureSchema();
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
      const files = readdirSync(folder).filter((f) => f.endsWith(".sql")).sort();
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
      backup_reminder_days INTEGER,
      locale TEXT NOT NULL DEFAULT 'zh-CN',
      theme TEXT NOT NULL DEFAULT 'light'
    );
  `);
  rawDb.exec(`INSERT OR IGNORE INTO settings (id) VALUES (1);`);
  console.warn("[migrate] no migrations folder available; created settings table only.");
}

/**
 * 执行 schema SQL：按 --> statement-breakpoint 分割，注入 IF NOT EXISTS 使其幂等
 */
function execSchemaSql(
  rawDb: ReturnType<typeof getRawDb>,
  sql: string,
): void {
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
      console.warn("[migrate] schema statement skipped:", (err as Error).message);
    }
  }
}
