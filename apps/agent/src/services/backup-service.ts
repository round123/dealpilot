/**
 * DealPilot 备份服务
 * SQLite 备份 + Argon2id 密码派生 + AES-256-GCM 加密
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { argon2id } from "hash-wasm";
import {
  BACKUP_MIN_PASSWORD_LENGTH,
  APP_VERSION,
} from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  createDatabaseSnapshot,
  replaceDatabaseFromBuffer,
} from "../repositories/backup-repository";
import { markBackupCreated } from "../repositories/system-repository";

const SALT_LENGTH = 32;
const IV_LENGTH = 12; // AES-256-GCM 标准 IV 长度
const KEY_LENGTH = 32; // AES-256
const BACKUP_MAGIC = "DPBK"; // DealPilot Backup magic
const BACKUP_VERSION = 2;
const ARGON2_MEMORY_KIB = 19 * 1024;
const ARGON2_ITERATIONS = 2;
const ARGON2_PARALLELISM = 1;
let restoreInProgress = false;

export function isRestoreInProgress(): boolean {
  return restoreInProgress;
}

/** Derive a deterministic AES key with the salt stored in the backup header. */
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const key = await argon2id({
    password,
    salt,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: KEY_LENGTH,
    outputType: "binary",
  });
  return Buffer.from(key);
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
  const dbData = createDatabaseSnapshot();

  // 加密
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const metadata = Buffer.from(
    JSON.stringify({
      app_version: APP_VERSION,
      schema_version: "1.0.0",
      created_at: new Date().toISOString(),
      db_size: dbData.length,
      kdf: {
        algorithm: "argon2id",
        memory_kib: ARGON2_MEMORY_KIB,
        iterations: ARGON2_ITERATIONS,
        parallelism: ARGON2_PARALLELISM,
      },
    }),
    "utf-8",
  );
  const key = await deriveKey(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(buildAssociatedData(salt, iv, metadata));

  const encrypted = Buffer.concat([
    cipher.update(dbData),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // 构建备份文件格式:
  // [magic(4)][version(1)][salt(32)][iv(12)][authTag(16)][metadata_len(4)][metadata(json)][encrypted_data]
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
  await markBackupCreated(new Date().toISOString());

  return backupBuffer;
}

/**
 * 校验备份文件完整性和兼容性
 */
export async function validateBackup(
  fileBuffer: Buffer,
  password: string,
): Promise<{
  valid: boolean;
  schema_version?: number;
  app_version?: string;
  integrity_ok: boolean;
}> {
  try {
    const { metadata } = await decryptBackup(fileBuffer, password);
    const meta = parseMetadata(metadata);
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
  if (restoreInProgress) throw ApiError.conflict("Restore operation in progress");
  restoreInProgress = true;
  try {
    let decrypted: Buffer;
    try {
      ({ decrypted } = await decryptBackup(fileBuffer, password));
    } catch {
      throw ApiError.badRequest("Invalid backup file or wrong password");
    }

    const rowsRestored = await replaceDatabaseFromBuffer(decrypted);
    return { success: true, rows_restored: rowsRestored };
  } finally {
    restoreInProgress = false;
  }
}

function buildAssociatedData(salt: Buffer, iv: Buffer, metadata: Buffer): Buffer {
  const metadataLength = Buffer.alloc(4);
  metadataLength.writeUInt32BE(metadata.length, 0);
  return Buffer.concat([
    Buffer.from(BACKUP_MAGIC, "ascii"),
    Buffer.from([BACKUP_VERSION]),
    salt,
    iv,
    metadataLength,
    metadata,
  ]);
}

function parseMetadata(metadata: Buffer) {
  const parsed = JSON.parse(metadata.toString("utf-8")) as {
    app_version?: unknown;
    kdf?: {
      algorithm?: unknown;
      memory_kib?: unknown;
      iterations?: unknown;
      parallelism?: unknown;
    };
  };
  if (typeof parsed.app_version !== "string"
    || parsed.kdf?.algorithm !== "argon2id"
    || parsed.kdf.memory_kib !== ARGON2_MEMORY_KIB
    || parsed.kdf.iterations !== ARGON2_ITERATIONS
    || parsed.kdf.parallelism !== ARGON2_PARALLELISM) {
    throw new Error("Unsupported backup metadata");
  }
  return parsed as typeof parsed & { app_version: string };
}

async function decryptBackup(fileBuffer: Buffer, password: string) {
  const { salt, iv, authTag, metadata, encrypted } = parseBackupFile(fileBuffer);
  parseMetadata(metadata);
  const key = await deriveKey(password, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(buildAssociatedData(salt, iv, metadata));
  decipher.setAuthTag(authTag);
  return {
    metadata,
    decrypted: Buffer.concat([decipher.update(encrypted), decipher.final()]),
  };
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
  const minimumLength = 4 + 1 + SALT_LENGTH + IV_LENGTH + 16 + 4 + 1;
  if (fileBuffer.length < minimumLength) {
    throw new Error("Backup file is truncated");
  }
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
  if (metaLen <= 0 || offset + metaLen >= fileBuffer.length) {
    throw new Error("Invalid backup metadata length");
  }
  const metadata = fileBuffer.subarray(offset, offset + metaLen);
  offset += metaLen;
  const encrypted = fileBuffer.subarray(offset);

  return { salt, iv, authTag, metadata, encrypted };
}
