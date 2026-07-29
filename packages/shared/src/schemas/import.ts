/**
 * DealPilot 导入 Zod schema
 */

import { z } from "zod";
import { UUIDSchema } from "./common.js";

export const ImportCommitRequestSchema = z.object({
  job_id: UUIDSchema,
  resolutions: z.array(z.object({
    row_index: z.number().int(),
    action: z.enum(["merge", "skip", "new"]),
    target_customer_id: UUIDSchema.optional(),
  })).optional().default([]),
});

export const ImportParseResponseSchema = z.object({
  job_id: UUIDSchema,
  total_rows: z.number().int(),
  valid_rows: z.number().int(),
  errors: z.array(z.object({
    row: z.number().int(),
    field: z.string().optional(),
    message: z.string(),
  })),
  duplicate_candidates: z.array(z.object({
    row_index: z.number().int(),
    existing_customer_id: UUIDSchema,
    existing_name: z.string(),
    new_name: z.string(),
  })),
  preview: z.array(z.record(z.string(), z.any())).max(50),
});

export const ImportCommitResponseSchema = z.object({
  success: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  duplicates: z.number().int(),
});
