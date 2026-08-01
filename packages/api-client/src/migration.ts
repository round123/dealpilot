import { z } from "zod";

import { API_ERROR_CODES, ApiError } from "./error.js";
import type { ApiClient, ApiRequestOptions } from "./gateway.js";

export const V1_MIGRATION_COLLECTIONS = [
  "companies",
  "contacts",
  "social_accounts",
  "deals",
  "follow_ups",
  "reminders",
  "deal_risks",
  "deal_milestones",
  "audit_events",
  "deletion_snapshots",
] as const;

export type V1MigrationCollection = (typeof V1_MIGRATION_COLLECTIONS)[number];

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);
const JsonRecordSchema = z.record(JsonValueSchema);

const SourceFileFingerprintSchema = z
  .object({
    role: z.enum(["database", "wal", "shm"]),
    present: z.boolean(),
    size_bytes: z.number().int().nonnegative(),
    mtime_ms: z.number().nonnegative(),
    sha256: Sha256Schema.nullable(),
  })
  .strict();

const TableSummarySchema = z
  .object({
    count: z.number().int().nonnegative(),
    first_id: z.string().nullable(),
    last_id: z.string().nullable(),
    checksum_sha256: Sha256Schema,
    idempotency_key: z.string().min(1),
  })
  .strict();

const MigrationRecordSchema = z
  .object({
    source_id: z.string().uuid(),
    target_id: z.string().uuid(),
    idempotency_key: z.string().min(1),
    payload_json: z.string().min(2),
    checksum_sha256: Sha256Schema,
    data: JsonRecordSchema,
  })
  .strict();

const CollectionObjectSchema = z
  .object(
    Object.fromEntries(
      V1_MIGRATION_COLLECTIONS.map((collection) => [
        collection,
        TableSummarySchema,
      ]),
    ) as Record<V1MigrationCollection, typeof TableSummarySchema>,
  )
  .strict();

const CollectionDataSchema = z
  .object(
    Object.fromEntries(
      V1_MIGRATION_COLLECTIONS.map((collection) => [
        collection,
        z.array(MigrationRecordSchema),
      ]),
    ) as Record<
      V1MigrationCollection,
      z.ZodArray<typeof MigrationRecordSchema>
    >,
  )
  .strict();

export const V1MigrationBundleSchema = z
  .object({
    format: z.literal("dealpilot-v1-sqlite-migration"),
    version: z.literal(1),
    idempotency_key: z.string().min(1).max(200),
    bundle_sha256: Sha256Schema,
    source: z
      .object({
        schema: z.literal("dealpilot-v1"),
        fingerprint: z
          .object({
            algorithm: z.literal("sha256"),
            aggregate_sha256: Sha256Schema,
            files: z.array(SourceFileFingerprintSchema).min(1),
          })
          .strict(),
        snapshot_sha256: Sha256Schema,
      })
      .strict(),
    preflight: z
      .object({
        integrity: z.enum(["ok", "failed"]),
        integrity_messages: z.array(z.string()),
        foreign_key_violations: z.number().int().nonnegative(),
        tables: z.record(z.object({ columns: z.array(z.string()) }).strict()),
      })
      .strict(),
    source_tables: z.record(TableSummarySchema),
    collections: CollectionObjectSchema,
    exclusions: z
      .object({
        import_jobs: z
          .object({
            count: z.number().int().nonnegative(),
            reason: z.literal("historical_run_records"),
          })
          .strict(),
        local_events: z
          .object({
            count: z.number().int().nonnegative(),
            reason: z.literal("not_required_for_audit_or_restore"),
          })
          .strict(),
        local_settings: z
          .object({
            fields: z.array(z.string()),
            reason: z.literal("device_local_only"),
          })
          .strict(),
      })
      .strict(),
    user_preferences: z
      .object({
        idempotency_key: z.string().min(1),
        locale: z.string().min(1).max(35),
        theme: z.enum(["light", "dark", "system"]),
      })
      .strict(),
    data: CollectionDataSchema,
    issues: z.array(
      z
        .object({
          severity: z.enum(["warning", "error"]),
          code: z.string().min(1),
          message: z.string().min(1),
          table: z.string().optional(),
          row_id: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((bundle, context) => {
    for (const collection of V1_MIGRATION_COLLECTIONS) {
      if (
        bundle.collections[collection].count !== bundle.data[collection].length
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["collections", collection, "count"],
          message: "Collection count does not match the bundled records",
        });
      }
    }
  });

const MigrationStatusSchema = z.enum([
  "running",
  "awaiting_confirmation",
  "confirmed",
  "abandoned",
  "failed",
]);

const BeginResultSchema = z
  .object({
    id: z.string().uuid(),
    status: MigrationStatusSchema,
    source_fingerprint: Sha256Schema,
    snapshot_checksum: Sha256Schema,
    expected_counts: z.record(z.number().int().nonnegative()),
    expected_checksums: z.record(Sha256Schema),
  })
  .strict();

const StageResultSchema = z
  .object({
    id: z.string().uuid(),
    collection: z.enum(V1_MIGRATION_COLLECTIONS),
    inserted: z.number().int().nonnegative(),
    replayed: z.number().int().nonnegative(),
    staged_count: z.number().int().nonnegative(),
  })
  .strict();

const ReconciliationDifferenceSchema = z
  .object({
    collection: z.enum(V1_MIGRATION_COLLECTIONS),
    expected_count: z.number().int().nonnegative(),
    actual_count: z.number().int().nonnegative(),
    expected_checksum: Sha256Schema,
    actual_checksum: Sha256Schema,
  })
  .strict();

const ReconcileResultSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["running", "awaiting_confirmation"]),
    ready: z.boolean(),
    actual_counts: z.record(z.number().int().nonnegative()),
    actual_checksums: z.record(Sha256Schema),
    differences: z.array(ReconciliationDifferenceSchema),
  })
  .strict();

const ConfirmResultSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal("confirmed"),
    confirmed_at: z.string().datetime({ offset: true }),
    imported_counts: z.record(z.number().int().nonnegative()),
    staging_cleared: z.literal(true),
  })
  .strict();

const AbandonResultSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal("abandoned"),
    staging_cleared: z.literal(true),
  })
  .strict();

export type V1MigrationBundle = z.infer<typeof V1MigrationBundleSchema>;
export type V1MigrationBeginResult = z.infer<typeof BeginResultSchema>;
export type V1MigrationStageResult = z.infer<typeof StageResultSchema>;
export type V1MigrationReconcileResult = z.infer<typeof ReconcileResultSchema>;
export type V1MigrationConfirmResult = z.infer<typeof ConfirmResultSchema>;
export type V1MigrationAbandonResult = z.infer<typeof AbandonResultSchema>;

export interface V1MigrationUploadProgress {
  collection: V1MigrationCollection;
  completed: number;
  total: number;
}

export interface V1MigrationUploadOptions extends ApiRequestOptions {
  batchSize?: number;
  onProgress?: (progress: V1MigrationUploadProgress) => void;
}

export interface V1MigrationUploadResult {
  job: V1MigrationBeginResult;
  reconciliation: V1MigrationReconcileResult | null;
}

export interface MigrationApi {
  parseBundle(input: unknown): Promise<V1MigrationBundle>;
  upload(
    input: unknown,
    options?: V1MigrationUploadOptions,
  ): Promise<V1MigrationUploadResult>;
  reconcile(
    jobId: string,
    options?: ApiRequestOptions,
  ): Promise<V1MigrationReconcileResult>;
  confirm(
    jobId: string,
    bundle: V1MigrationBundle,
    options?: ApiRequestOptions,
  ): Promise<V1MigrationConfirmResult>;
  abandon(
    jobId: string,
    options?: ApiRequestOptions,
  ): Promise<V1MigrationAbandonResult>;
}

type MigrationGateway = Pick<ApiClient, "rpc">;

export function createMigrationApi(gateway: MigrationGateway): MigrationApi {
  const parseBundle = async (input: unknown): Promise<V1MigrationBundle> => {
    const parsed = V1MigrationBundleSchema.safeParse(input);
    if (!parsed.success) {
      throw validationError("Invalid V1 migration bundle", parsed.error.issues);
    }
    const { bundle_sha256: declaredHash, ...unsignedBundle } = parsed.data;
    const actualHash = await sha256Hex(stableJson(unsignedBundle));
    if (actualHash !== declaredHash) {
      throw new ApiError({
        code: API_ERROR_CODES.validation,
        message: "V1 migration bundle checksum does not match its contents",
        status: 400,
        fields: { bundle_sha256: ["Checksum mismatch"] },
      });
    }
    return parsed.data;
  };

  const reconcile = async (jobId: string, options: ApiRequestOptions = {}) => {
    return gateway.rpc(
      "reconcile_v1_migration",
      { p_job_id: parseJobId(jobId) },
      ReconcileResultSchema,
      options,
    );
  };

  return {
    parseBundle,

    async upload(input, options = {}) {
      const bundle = await parseBundle(input);
      const batchSize = options.batchSize ?? 500;
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
        throw new ApiError({
          code: API_ERROR_CODES.validation,
          message: "Migration batch size must be between 1 and 500",
          status: 400,
          fields: { batchSize: ["Must be an integer between 1 and 500"] },
        });
      }

      const counts = Object.fromEntries(
        V1_MIGRATION_COLLECTIONS.map((name) => [
          name,
          bundle.collections[name].count,
        ]),
      );
      const checksums = Object.fromEntries(
        V1_MIGRATION_COLLECTIONS.map((name) => [
          name,
          bundle.collections[name].checksum_sha256,
        ]),
      );
      const job = await gateway.rpc(
        "begin_v1_migration",
        {
          p_idempotency_key: bundle.idempotency_key,
          p_source_fingerprint: bundle.source.fingerprint.aggregate_sha256,
          p_snapshot_checksum: bundle.source.snapshot_sha256,
          p_expected_counts: counts,
          p_expected_checksums: checksums,
          p_user_preferences: {
            locale: bundle.user_preferences.locale,
            theme: bundle.user_preferences.theme,
          },
        },
        BeginResultSchema,
        { signal: options.signal },
      );
      if (job.status === "confirmed") return { job, reconciliation: null };
      if (job.status === "abandoned" || job.status === "failed") {
        throw new ApiError({
          code: API_ERROR_CODES.invalidResponse,
          message: `Migration job cannot continue from status ${job.status}`,
          details: { jobId: job.id, status: job.status },
        });
      }

      if (job.status === "running") {
        for (const collection of V1_MIGRATION_COLLECTIONS) {
          const records = bundle.data[collection];
          if (records.length === 0) {
            options.onProgress?.({ collection, completed: 0, total: 0 });
            continue;
          }
          for (let offset = 0; offset < records.length; offset += batchSize) {
            const batch = records
              .slice(offset, offset + batchSize)
              .map((record) => ({
                source_id: record.source_id,
                idempotency_key: record.idempotency_key,
                payload_json: record.payload_json,
                checksum_sha256: record.checksum_sha256,
              }));
            const staged = await gateway.rpc(
              "stage_v1_migration_batch",
              {
                p_job_id: job.id,
                p_collection: collection,
                p_records: batch,
              },
              StageResultSchema,
              { signal: options.signal },
            );
            options.onProgress?.({
              collection,
              completed: staged.staged_count,
              total: records.length,
            });
          }
        }
      }
      return { job, reconciliation: await reconcile(job.id, options) };
    },

    reconcile,

    async confirm(jobId, bundle, options = {}) {
      const parsedJobId = parseJobId(jobId);
      const parsedBundle = await parseBundle(bundle);
      const counts = Object.fromEntries(
        V1_MIGRATION_COLLECTIONS.map((name) => [
          name,
          parsedBundle.collections[name].count,
        ]),
      );
      const checksums = Object.fromEntries(
        V1_MIGRATION_COLLECTIONS.map((name) => [
          name,
          parsedBundle.collections[name].checksum_sha256,
        ]),
      );
      return gateway.rpc(
        "confirm_v1_migration",
        {
          p_job_id: parsedJobId,
          p_source_fingerprint:
            parsedBundle.source.fingerprint.aggregate_sha256,
          p_expected_counts: counts,
          p_expected_checksums: checksums,
        },
        ConfirmResultSchema,
        options,
      );
    },

    async abandon(jobId, options = {}) {
      return gateway.rpc(
        "abandon_v1_migration",
        { p_job_id: parseJobId(jobId) },
        AbandonResultSchema,
        options,
      );
    },
  };
}

const parseJobId = (jobId: string): string => {
  const parsed = z.string().uuid().safeParse(jobId);
  if (parsed.success) return parsed.data;

  throw validationError(
    "Invalid V1 migration job ID",
    parsed.error.issues.map((issue) => ({
      path: ["jobId", ...issue.path],
      message: issue.message,
    })),
  );
};

const validationError = (
  message: string,
  issues: ReadonlyArray<{ path: Array<string | number>; message: string }>,
) =>
  new ApiError({
    code: API_ERROR_CODES.validation,
    message,
    status: 400,
    fields: Object.fromEntries(
      issues.map((issue) => [
        issue.path.join(".") || "bundle",
        [issue.message],
      ]),
    ),
    details: issues,
  });

const stableJson = (value: unknown): string => JSON.stringify(sortJson(value));

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};
