import { describe, expect, it, vi } from "vitest";

import { BackupSnapshotSchema, createBackupApi } from "../src/backup.js";

const snapshotId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-07-31T08:00:00.000Z";

const snapshot = {
  id: snapshotId,
  label: "手动备份",
  schema_version: 1,
  checksum: "sha256:abc",
  created_at: createdAt,
  row_counts: { companies: 3, contacts: 5 },
};

describe("backup API", () => {
  it("lists snapshot metadata through the typed resource gateway", async () => {
    const list = vi.fn(async (_resource, schema, _options) => ({
      data: [schema.parse(snapshot)],
      total: 1,
    }));
    const backups = createBackupApi({
      list,
      rpc: vi.fn(),
    });
    const signal = new AbortController().signal;

    await expect(
      backups.list({
        pagination: { page: 1, perPage: 20 },
        sort: { field: "created_at", order: "desc" },
        signal,
      }),
    ).resolves.toEqual({ data: [snapshot], total: 1 });
    expect(list).toHaveBeenCalledWith(
      "backup_snapshots",
      expect.anything(),
      expect.objectContaining({
        signal,
        select:
          "id,owner_user_id,label,schema_version,checksum,created_at,row_counts",
      }),
    );
  });

  it("creates a snapshot with a parsed label and unwraps the RPC data", async () => {
    const rpc = vi.fn(async (_name, args, schema) => {
      expect(args).toEqual({ p_label: "手动备份" });
      return schema.parse(snapshot);
    });
    const backups = createBackupApi({
      list: vi.fn(),
      rpc,
    });

    await expect(backups.create({ label: " 手动备份 " })).resolves.toEqual(
      snapshot,
    );
    expect(rpc).toHaveBeenCalledWith(
      "create_backup_snapshot",
      { p_label: "手动备份" },
      expect.anything(),
      {},
    );
  });

  it("restores a UUID snapshot and parses restored counts/checksum", async () => {
    const rpc = vi.fn(async (_name, args, schema) => {
      expect(args).toEqual({ p_snapshot_id: snapshotId });
      return schema.parse({
        id: snapshotId,
        restored_counts: { companies: 3, contacts: 5 },
        checksum: "sha256:abc",
      });
    });
    const backups = createBackupApi({ list: vi.fn(), rpc });

    await expect(backups.restore(snapshotId)).resolves.toEqual({
      id: snapshotId,
      restored_counts: { companies: 3, contacts: 5 },
      checksum: "sha256:abc",
    });
    await expect(backups.restore("bad-id")).rejects.toThrow(
      "Backup snapshot id must be a UUID",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed successful snapshot responses at the boundary", async () => {
    const backups = createBackupApi({
      list: vi.fn(),
      rpc: vi.fn(async (_name, _args, schema) =>
        schema.parse({ data: { id: "not-a-uuid" } }),
      ),
    });

    await expect(backups.create()).rejects.toThrow();
    expect(BackupSnapshotSchema.safeParse({ id: "not-a-uuid" }).success).toBe(
      false,
    );
  });
});
