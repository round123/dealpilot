import {
  API_ERROR_CODES,
  ApiError,
  type BackupExport,
  type BackupPayloadRestoreInput,
} from "@dealpilot/api-client";
import { z } from "zod";

const ARCHIVE_FORMAT = "dealpilot-cloud-backup";
const ARCHIVE_VERSION = 1;
const KDF_ITERATIONS = 310_000;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

const Base64Schema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
const ArchiveSchema = z
  .object({
    format: z.literal(ARCHIVE_FORMAT),
    archive_version: z.literal(ARCHIVE_VERSION),
    kdf: z
      .object({
        name: z.literal("PBKDF2"),
        hash: z.literal("SHA-256"),
        iterations: z.number().int().min(100_000).max(2_000_000),
        salt: Base64Schema,
      })
      .strict(),
    cipher: z
      .object({
        name: z.literal("AES-GCM"),
        key_bits: z.literal(256),
        tag_length: z.literal(128),
        iv: Base64Schema,
      })
      .strict(),
    content_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    ciphertext: Base64Schema,
  })
  .strict();

const ContentSchema = z
  .object({
    snapshot_id: z.string().uuid(),
    created_at: z.string().datetime({ offset: true }),
    schema_version: z.literal(1),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    row_counts: z.record(z.string(), z.number().int().nonnegative()),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type InspectedEncryptedBackup = {
  snapshotId: string;
  createdAt: string;
  rowCounts: Record<string, number>;
  restoreInput: BackupPayloadRestoreInput;
};

export async function createEncryptedBackupArchive(
  snapshot: BackupExport,
  password: string,
): Promise<Blob> {
  assertPassword(password);
  const content = ContentSchema.parse({
    snapshot_id: snapshot.id,
    created_at: snapshot.created_at,
    schema_version: snapshot.schema_version,
    checksum: snapshot.checksum,
    row_counts: snapshot.row_counts,
    payload: snapshot.payload,
  });
  const plaintext = new TextEncoder().encode(JSON.stringify(content));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key,
      plaintext,
    ),
  );
  const archive = ArchiveSchema.parse({
    format: ARCHIVE_FORMAT,
    archive_version: ARCHIVE_VERSION,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: KDF_ITERATIONS,
      salt: toBase64(salt),
    },
    cipher: {
      name: "AES-GCM",
      key_bits: 256,
      tag_length: 128,
      iv: toBase64(iv),
    },
    content_sha256: await sha256Hex(plaintext),
    ciphertext: toBase64(ciphertext),
  });

  return new Blob([JSON.stringify(archive)], {
    type: "application/vnd.dealpilot.cloud-backup+json",
  });
}

export async function inspectEncryptedBackupArchive(
  file: Blob,
  password: string,
): Promise<InspectedEncryptedBackup> {
  assertPassword(password);
  if (file.size === 0 || file.size > MAX_ARCHIVE_BYTES) {
    throw backupError("备份文件为空或超过 100 MB", "file");
  }

  let archive: z.infer<typeof ArchiveSchema>;
  try {
    archive = ArchiveSchema.parse(JSON.parse(await file.text()));
  } catch (error) {
    throw backupError("备份文件格式或版本不受支持", "file", error);
  }

  let plaintext: Uint8Array<ArrayBuffer>;
  try {
    const salt = fromBase64(archive.kdf.salt);
    const iv = fromBase64(archive.cipher.iv);
    if (salt.byteLength !== 16 || iv.byteLength !== 12) {
      throw new Error("Invalid salt or IV length");
    }
    const key = await deriveKey(password, salt, archive.kdf.iterations);
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, tagLength: archive.cipher.tag_length },
        key,
        fromBase64(archive.ciphertext),
      ),
    );
  } catch (error) {
    throw backupError("密码错误或备份文件已被篡改", "password", error);
  }

  if ((await sha256Hex(plaintext)) !== archive.content_sha256) {
    throw backupError("备份文件完整性校验失败", "file");
  }

  let content: z.infer<typeof ContentSchema>;
  try {
    content = ContentSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)),
    );
  } catch (error) {
    throw backupError("备份内容不兼容或已经损坏", "file", error);
  }

  return {
    snapshotId: content.snapshot_id,
    createdAt: content.created_at,
    rowCounts: content.row_counts,
    restoreInput: {
      schemaVersion: content.schema_version,
      checksum: content.checksum,
      payload: content.payload,
    },
  };
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function sha256Hex(value: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function assertPassword(password: string) {
  if (password.length < 8) {
    throw backupError("备份密码至少需要 8 个字符", "password");
  }
}

function backupError(message: string, field: string, cause?: unknown) {
  return new ApiError({
    code: API_ERROR_CODES.validation,
    message,
    status: 400,
    fields: { [field]: [message] },
    cause,
  });
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
