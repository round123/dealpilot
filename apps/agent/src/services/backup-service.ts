/**
 * DealPilot 备份服务
 * SQLite 备份 + Argon2id 密码派生 + AES-256-GCM 加密
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config/config";
import { db, getRawDb } from "../db/client";
import { settings } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  BACKUP_MIN_PASSWORD_LENGTH,
  APP_VERSION,
} from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";

const SALT_LENGTH = 32;
const IV_LENGTH = 12; // AES-256-GCM 标准 IV 长度
const KEY_LENGTH = 32; // AES-256
const BACKUP_MAGIC = "DPBK"; // DealPilot Backup magic
const BACKUP_VERSION = 1;

/**
 * 从密码派生加密密钥（使用 scrypt，兼容 Bun）
 * Bun.password.hash 使用 Argon2id，但输出的是验证哈希格式，不适合直接做密钥派生
 * 这里使用 scrypt 做密钥派生，密码验证用 Argon2id（Bun.password.hash/verify）
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    N: 16384, // CPU/memory cost
    r: 8,
    p: 1,
  });
}

/**
 * 创建加密备份
 * 使用 SQLite Online Backup API 导出数据库，然后用 AES-256-GCM 加密
 */
export async function createBackup(password: string): Promise<Buffer> {
  if (password.length < BACKUP_MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(`Password must be at least ${BACKUP_MIN_PASSWORD_LENGTH} characters`);
  }

  // 使用 bun:sqlite 的 backup API 导出数据库到临时文件
  const tempDbPath = join(config.dataDir, `backup-temp-${Date.now()}.db`);
  const rawDb = getRawDb();

  // 使用 SQLite backup API
  rawDb.exec(`VACUUM INTO '${tempDbPath}';`);
  const dbData = readFileSync(tempDbPath);

  // 清理临时文件
  try {
    unlinkSync(tempDbPath);
  } catch {
    // 忽略清理失败
  }

  // 加密
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(dbData),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // 构建备份文件格式:
  // [magic(4)][version(1)][salt(32)][iv(12)][authTag(16)][metadata_len(4)][metadata(json)][encrypted_data]
  const metadata = Buffer.from(
    JSON.stringify({
      app_version: APP_VERSION,
      schema_version: "1.0.0",
      created_at: new Date().toISOString(),
      db_size: dbData.length,
    }),
    "utf-8",
  );
  const metaLenBuf = Buffer.alloc(4);
  metaLenBuf.writeUInt32BE(metadata.length, 0);

  const backupBuffer = Buffer.concat([
    Buffer.from(BACKUP_MAGIC, "ascii"),
    Buffer.from([BACKUP_VERSION]),
    salt,
    iv,
    authTag,
    metaLenBuf,
    metadata,
    encrypted,
  ]);

  // 更新最后备份时间
  await db
    .update(settings)
    .set({ last_backup_at: new Date().toISOString() })
    .where(eq(settings.id, 1));

  return backupBuffer;
}

/**
 * 校验备份文件完整性和兼容性
 */
export function validateBackup(
  fileBuffer: Buffer,
  password: string,
): {
  valid: boolean;
  schema_version?: number;
  app_version?: string;
  integrity_ok: boolean;
} {
  try {
    const { salt, iv, authTag, metadata, encrypted } = parseBackupFile(fileBuffer);
    const key = deriveKey(password, salt);

    // 尝试解密以验证密码和完整性
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    try {
      decipher.update(encrypted);
      decipher.final();
    } catch {
      // 密码错误或数据损坏
      return { valid: false, integrity_ok: false };
    }

    const meta = JSON.parse(metadata.toString("utf-8"));
    return {
      valid: true,
      schema_version: BACKUP_VERSION,
      app_version: meta.app_version,
      integrity_ok: true,
    };
  } catch {
    return { valid: false, integrity_ok: false };
  }
}

/**
 * 恢复备份
 * 先校验完整性，失败不覆盖当前数据库
 */
export async function restoreBackup(
  fileBuffer: Buffer,
  password: string,
): Promise<{ success: boolean; rows_restored: number }> {
  // 先校验
  const validation = validateBackup(fileBuffer, password);
  if (!validation.valid) {
    throw ApiError.badRequest("Invalid backup file or wrong password");
  }

  // 解密
  const { salt, iv, authTag, encrypted } = parseBackupFile(fileBuffer);
  const key = deriveKey(password, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  // 写入临时文件
  const tempDbPath = join(config.dataDir, `restore-temp-${Date.now()}.db`);
  writeFileSync(tempDbPath, decrypted);

  try {
    // 统计行数
    const Database = (await import("bun:sqlite")).Database;
    const restoreDb = new Database(tempDbPath, { readonly: true });
    let rowsRestored = 0;

    const tables = [
      "customers", "contacts", "social_accounts", "projects",
      "follow_ups", "reminders", "risks", "milestones",
      "import_jobs", "local_events", "settings",
    ];

    for (const table of tables) {
      try {
        const count = restoreDb.query(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
        rowsRestored += count.c;
      } catch {
        // 表可能不存在
      }
    }
    restoreDb.close();

    // 覆盖当前数据库
    copyFileSync(tempDbPath, config.dbPath);

    return { success: true, rows_restored: rowsRestored };
  } finally {
    try {
      unlinkSync(tempDbPath);
    } catch {
      // 忽略
    }
  }
}

/**
 * 解析备份文件格式
 */
function parseBackupFile(fileBuffer: Buffer): {
  salt: Buffer;
  iv: Buffer;
  authTag: Buffer;
  metadata: Buffer;
  encrypted: Buffer;
} {
  const magic = fileBuffer.subarray(0, 4).toString("ascii");
  if (magic !== BACKUP_MAGIC) {
    throw new Error("Invalid backup file format");
  }

  const version = fileBuffer.readUInt8(4);
  if (version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${version}`);
  }

  let offset = 5;
  const salt = fileBuffer.subarray(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = fileBuffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = fileBuffer.subarray(offset, offset + 16);
  offset += 16;
  const metaLen = fileBuffer.readUInt32BE(offset);
  offset += 4;
  const metadata = fileBuffer.subarray(offset, offset + metaLen);
  offset += metaLen;
  const encrypted = fileBuffer.subarray(offset);

  return { salt, iv, authTag, metadata, encrypted };
}
