import { z } from "zod";

import { parseData } from "./contracts.js";
import { API_ERROR_CODES, ApiError } from "./error.js";
import type { ApiClient, ApiRequestOptions } from "./gateway.js";

export const CloudImportRowSchema = z
  .object({
    row_index: z.number().int().positive(),
    name: z.string().trim().min(1),
    company: z.string().nullable(),
    country: z.string().nullable(),
    source: z.string().nullable(),
    grade: z.enum(["A", "B", "C"]),
    contact_name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    platform: z.string().nullable(),
    platform_account: z.string().nullable(),
  })
  .strict()
  .refine((row) => Boolean(row.platform) === Boolean(row.platform_account), {
    message: "Platform and platform account must be supplied together",
    path: ["platform_account"],
  });

export const CloudImportResolutionSchema = z
  .object({
    row_index: z.number().int().positive(),
    action: z.enum(["merge", "skip", "new"]),
    target_customer_id: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (resolution) =>
      resolution.action !== "merge" || resolution.target_customer_id !== undefined,
    {
      message: "Merge resolution requires a target customer",
      path: ["target_customer_id"],
    },
  );

export const CloudImportCommitInputSchema = z
  .object({
    jobId: z.string().uuid(),
    idempotencyKey: z.string().trim().min(1).max(200),
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
    rows: z.array(CloudImportRowSchema).max(1_000),
    resolutions: z.array(CloudImportResolutionSchema).max(1_000).default([]),
    invalidCount: z.number().int().min(0).max(1_000).default(0),
  })
  .strict()
  .refine((input) => input.rows.length + input.invalidCount <= 1_000, {
    message: "Import payload exceeds the 1000 row limit",
    path: ["rows"],
  });

export const CloudImportWarningSchema = z
  .object({
    code: z.literal("PLATFORM_ACCOUNT_NOT_COPIED"),
    row_index: z.number().int().positive(),
    field: z.literal("platform_account"),
    platform: z.string(),
    platform_account: z.string(),
    existing_customer_id: z.string().uuid(),
  })
  .strict();

export const CloudImportCommitResultSchema = z
  .object({
    success: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    warnings: z.array(CloudImportWarningSchema),
  })
  .strict();

export type CloudImportRow = z.infer<typeof CloudImportRowSchema>;
export type CloudImportResolution = z.infer<typeof CloudImportResolutionSchema>;
export type CloudImportCommitInput = z.infer<
  typeof CloudImportCommitInputSchema
>;
export type CloudImportCommitResult = z.infer<
  typeof CloudImportCommitResultSchema
>;

export interface ImportApi {
  commit(
    input: CloudImportCommitInput,
    options?: ApiRequestOptions,
  ): Promise<CloudImportCommitResult>;
}

type ImportGateway = Pick<ApiClient, "rpc">;

export function createImportApi(gateway: ImportGateway): ImportApi {
  return {
    async commit(input, options = {}) {
      const parsed = CloudImportCommitInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new ApiError({
          code: API_ERROR_CODES.validation,
          message: "Invalid cloud import commit input",
          status: 400,
          fields: issuesToFields(parsed.error.issues),
          details: parsed.error.issues,
        });
      }

      const raw = await gateway.rpc(
        "commit_customer_import",
        {
          p_job_id: parsed.data.jobId,
          p_idempotency_key: parsed.data.idempotencyKey,
          p_payload_hash: parsed.data.payloadHash,
          p_rows: parsed.data.rows,
          p_resolutions: parsed.data.resolutions,
          p_invalid_count: parsed.data.invalidCount,
        },
        z.unknown(),
        options,
      );
      return parseData(CloudImportCommitResultSchema, raw);
    },
  };
}

const issuesToFields = (
  issues: ReadonlyArray<{ path: Array<string | number>; message: string }>,
) => {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.join(".") || "request";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
};
