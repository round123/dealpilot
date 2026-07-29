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

export const db = getDb();
export { schema };
