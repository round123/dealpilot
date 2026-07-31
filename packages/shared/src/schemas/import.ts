/**
 * DealPilot 导入 Zod schema
 */

import { z } from "zod";
import { UUIDSchema } from "./common.js";

export const ImportFieldTargetSchema = z.enum([
  "name",
  "company",
  "country",
  "source",
  "grade",
  "contact_name",
  "email",
  "phone",
]);

const ImportSourceColumnSchema = z.string().trim().min(1).max(200);

export const ImportFieldMappingSchema = z
  .object({
    name: ImportSourceColumnSchema,
    company: ImportSourceColumnSchema.optional(),
    country: ImportSourceColumnSchema.optional(),
    source: ImportSourceColumnSchema.optional(),
    grade: ImportSourceColumnSchema.optional(),
    contact_name: ImportSourceColumnSchema.optional(),
    email: ImportSourceColumnSchema.optional(),
    phone: ImportSourceColumnSchema.optional(),
  })
  .strict()
  .superRefine((mapping, context) => {
    const targetsBySource = new Map<string, string>();
    for (const [target, source] of Object.entries(mapping)) {
      if (!source) continue;
      const previousTarget = targetsBySource.get(source);
      if (previousTarget) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [target],
          message: `Source column is already mapped to ${previousTarget}`,
        });
        continue;
      }
      targetsBySource.set(source, target);
    }
  });

export const ImportParseRequestSchema = z
  .object({
    mapping: ImportFieldMappingSchema.optional(),
  })
  .strict();

export const ImportCommitRequestSchema = z.object({
  job_id: UUIDSchema,
  resolutions: z
    .array(
      z.object({
        row_index: z.number().int(),
        action: z.enum(["merge", "skip", "new"]),
        target_customer_id: UUIDSchema.optional(),
      }),
    )
    .optional()
    .default([]),
});

export const ImportParseResponseSchema = z.object({
  job_id: UUIDSchema,
  total_rows: z.number().int(),
  valid_rows: z.number().int(),
  errors: z.array(
    z.object({
      row: z.number().int(),
      field: z.string().optional(),
      message: z.string(),
    }),
  ),
  duplicate_candidates: z.array(
    z.object({
      row_index: z.number().int(),
      existing_customer_id: UUIDSchema,
      existing_name: z.string(),
      new_name: z.string(),
    }),
  ),
  source_columns: z.array(z.string()).default([]),
  preview: z.array(z.record(z.string(), z.any())).max(50),
});

export const ImportCommitResponseSchema = z.object({
  success: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  duplicates: z.number().int(),
});
