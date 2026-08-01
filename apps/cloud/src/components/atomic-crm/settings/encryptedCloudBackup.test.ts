import type { BackupExport } from "@dealpilot/api-client";
import { describe, expect, it } from "vitest";

import {
  createEncryptedBackupArchive,
  inspectEncryptedBackupArchive,
} from "./encryptedCloudBackup";

const password = "correct horse battery staple";
const exported: BackupExport = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-08-01T08:00:00.000Z",
  schema_version: 1,
  checksum: "a".repeat(64),
  row_counts: { companies: 1, follow_ups: 2 },
  payload: {
    schema_version: 1,
    profile: { id: "22222222-2222-4222-8222-222222222222" },
    configuration: {
      owner_user_id: "22222222-2222-4222-8222-222222222222",
    },
    companies: [],
  },
};

describe("encrypted cloud backup archive", () => {
  it("round-trips a versioned AES-GCM archive without embedding the password", async () => {
    const archive = await createEncryptedBackupArchive(exported, password);
    const raw = await archive.text();

    expect(raw).not.toContain(password);
    expect(JSON.parse(raw)).toMatchObject({
      format: "dealpilot-cloud-backup",
      archive_version: 1,
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 310_000 },
      cipher: { name: "AES-GCM", key_bits: 256, tag_length: 128 },
    });
    await expect(
      inspectEncryptedBackupArchive(archive, password),
    ).resolves.toEqual({
      snapshotId: exported.id,
      createdAt: exported.created_at,
      rowCounts: exported.row_counts,
      restoreInput: {
        schemaVersion: 1,
        checksum: exported.checksum,
        payload: exported.payload,
      },
    });
  });

  it("rejects a wrong password and modified ciphertext", async () => {
    const archive = await createEncryptedBackupArchive(exported, password);
    await expect(
      inspectEncryptedBackupArchive(archive, "wrong password"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const raw = JSON.parse(await archive.text());
    raw.ciphertext = `${raw.ciphertext.slice(0, -4)}AAAA`;
    await expect(
      inspectEncryptedBackupArchive(new Blob([JSON.stringify(raw)]), password),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an unknown archive version before decryption", async () => {
    const archive = await createEncryptedBackupArchive(exported, password);
    const raw = JSON.parse(await archive.text());
    raw.archive_version = 2;

    await expect(
      inspectEncryptedBackupArchive(new Blob([JSON.stringify(raw)]), password),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { file: ["备份文件格式或版本不受支持"] },
    });
  });
});
