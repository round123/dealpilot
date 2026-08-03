import { z } from "zod";

import type { ApiRequestOptions, ListOptions, ListResult } from "./gateway.js";
import type { ApiClient } from "./gateway.js";
import { parseData } from "./contracts.js";
import { API_ERROR_CODES, ApiError } from "./error.js";

const DateTimeSchema = z.string().datetime({ offset: true });
const CountsSchema = z.record(z.number().int().nonnegative());
const BACKUP_METADATA_SELECT =
  "id,owner_user_id,label,schema_version,checksum,created_at,row_counts";

/** Metadata for a cloud snapshot. Payload is returned only for an explicit export. */
export const BackupSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    owner_user_id: z.string().uuid().optional(),
    label: z.string().nullable().optional(),
    schema_version: z.number().int().nonnegative(),
    checksum: z.string().min(1),
    created_at: DateTimeSchema,
    restored_at: DateTimeSchema.nullable().optional(),
    row_counts: CountsSchema.optional(),
    payload: z.unknown().optional(),
  })
  .passthrough();

export const BackupCreateInputSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const BackupRestoreResultSchema = z
  .object({
    id: z.string().uuid(),
    restored_counts: CountsSchema,
    checksum: z.string().min(1),
  })
  .passthrough();

export const BackupExportSchema = z
  .object({
    id: z.string().uuid(),
    schema_version: z.literal(1),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    row_counts: CountsSchema,
    created_at: DateTimeSchema,
    payload: z.record(z.unknown()),
  })
  .strict();

export const BackupPayloadRestoreInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
    payload: z.record(z.unknown()),
  })
  .strict();

export type BackupSnapshot = z.infer<typeof BackupSnapshotSchema>;
export type BackupCreateInput = z.infer<typeof BackupCreateInputSchema>;
export type BackupRestoreResult = z.infer<typeof BackupRestoreResultSchema>;
export type BackupExport = z.infer<typeof BackupExportSchema>;
export type BackupPayloadRestoreInput = z.infer<
  typeof BackupPayloadRestoreInputSchema
>;

export interface BackupApi {
  list(options?: ListOptions): Promise<ListResult<BackupSnapshot>>;
  create(
    input?: BackupCreateInput,
    options?: ApiRequestOptions,
  ): Promise<BackupSnapshot>;
  restore(
    snapshotId: string,
    options?: ApiRequestOptions,
  ): Promise<BackupRestoreResult>;
  exportPayload(
    snapshotId: string,
    options?: ApiRequestOptions,
  ): Promise<BackupExport>;
  restorePayload(
    input: BackupPayloadRestoreInput,
    options?: ApiRequestOptions,
  ): Promise<BackupRestoreResult>;
}

type BackupGateway = Pick<ApiClient, "list" | "rpc">;

export function createBackupApi(gateway: BackupGateway): BackupApi {
  return {
    list(options = {}) {
      return gateway.list("backup_snapshots", BackupSnapshotSchema, {
        ...options,
        select: options.select ?? BACKUP_METADATA_SELECT,
      });
    },

    async create(input = {}, options = {}) {
      const parsedInput = parseInput(input);
      const raw = await gateway.rpc(
        "create_backup_snapshot",
        { p_label: parsedInput.label ?? null },
        z.unknown(),
        options,
      );
      return parseData(BackupSnapshotSchema, raw);
    },

    async restore(snapshotId, options = {}) {
      const parsedId = parseSnapshotId(snapshotId);
      const raw = await gateway.rpc(
        "restore_backup_snapshot",
        { p_snapshot_id: parsedId },
        z.unknown(),
        options,
      );
      return parseData(BackupRestoreResultSchema, raw);
    },

    async exportPayload(snapshotId, options = {}) {
      const parsedId = parseSnapshotId(snapshotId);
      const raw = await gateway.rpc(
        "export_backup_snapshot",
        { p_snapshot_id: parsedId },
        z.unknown(),
        options,
      );
      return parseData(BackupExportSchema, raw);
    },

    async restorePayload(input, options = {}) {
      const parsed = BackupPayloadRestoreInputSchema.safeParse(input);
      if (!parsed.success) {
        throw validationError(
          "Invalid backup payload restore input",
          { backup: ["Backup payload is invalid or unsupported"] },
          parsed.error.issues,
        );
      }
      const raw = await gateway.rpc(
        "restore_backup_payload",
        {
          p_schema_version: parsed.data.schemaVersion,
          p_checksum: parsed.data.checksum,
          p_payload: parsed.data.payload,
        },
        z.unknown(),
        options,
      );
      return parseData(BackupRestoreResultSchema, raw);
    },
  };
}

function parseInput(input: unknown): BackupCreateInput {
  const parsed = BackupCreateInputSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw validationError(
    "Invalid backup create input",
    { label: ["Label must be between 1 and 200 characters"] },
    parsed.error.issues,
  );
}

function validationError(
  message: string,
  fields: Record<string, string[]>,
  details?: unknown,
) {
  return new ApiError({
    code: API_ERROR_CODES.validation,
    message,
    status: 400,
    fields,
    details,
  });
}

function parseSnapshotId(snapshotId: unknown): string {
  const parsed = z.string().uuid().safeParse(snapshotId);
  if (parsed.success) return parsed.data;
  throw new ApiError({
    code: API_ERROR_CODES.validation,
    message: "Backup snapshot id must be a UUID",
    status: 400,
    fields: { snapshot_id: ["Must be a valid UUID"] },
    details: parsed.error.issues,
  });
}
