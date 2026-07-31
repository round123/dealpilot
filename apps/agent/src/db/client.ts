/**
 * DealPilot 数据库客户端
 * 使用 bun:sqlite 连接 SQLite，启用 WAL 模式、外键约束、busy_timeout
 */

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { config } from "../config/config";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _rawDb: Database | null = null;

/**
 * 获取原始 bun:sqlite Database 实例（用于底层操作如备份）
 */
export function getRawDb(): Database {
  if (!_rawDb) {
    _rawDb = new Database(config.dbPath, { create: true });
    _rawDb.exec("PRAGMA journal_mode = WAL;");
    _rawDb.exec("PRAGMA foreign_keys = ON;");
    _rawDb.exec(`PRAGMA busy_timeout = ${config.sqliteBusyTimeout};`);
    _rawDb.exec("PRAGMA synchronous = NORMAL;");
  }
  return _rawDb;
}

/**
 * 获取 Drizzle ORM 实例
 */
export function getDb() {
  if (!_db) {
    _db = drizzle(getRawDb(), { schema });
  }
  return _db;
}

export let db = getDb();

export function closeDatabase(): void {
  let closeError: unknown;
  try {
    if (_rawDb) {
      try {
        _rawDb.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      } catch (error) {
        closeError = error;
      }
      try {
        _rawDb.close();
      } catch (error) {
        closeError ??= error;
      }
    }
  } finally {
    _rawDb = null;
    _db = null;
    // Release the exported Drizzle wrapper as well; it retains the SQLite
    // handle and can keep the file locked on Windows during atomic swaps.
    db = null as unknown as ReturnType<typeof getDb>;
    Bun.gc(true);
  }
  if (closeError) throw closeError;
}

export function reopenDatabase(): void {
  db = getDb();
}

export { schema };
