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
  "platform",
  "platform_account",
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
    platform: ImportSourceColumnSchema.optional(),
    platform_account: ImportSourceColumnSchema.optional(),
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
      z
        .object({
          row_index: z.number().int().positive(),
          action: z.enum(["merge", "skip", "new"]),
          target_customer_id: UUIDSchema.optional(),
        })
        .superRefine((resolution, context) => {
          if (resolution.action === "merge" && !resolution.target_customer_id) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["target_customer_id"],
              message: "Merge resolution requires a target customer",
            });
          }
        }),
    )
    .superRefine((resolutions, context) => {
      const seen = new Set<number>();
      resolutions.forEach((resolution, index) => {
        if (seen.has(resolution.row_index)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "row_index"],
            message: "Each import row may only have one resolution",
          });
        }
        seen.add(resolution.row_index);
      });
    })
    .optional()
    .default([]),
});

const ImportCustomerSnapshotSchema = z.object({
  customer_id: UUIDSchema.optional(),
  name: z.string(),
  company: z.string().nullable(),
  country: z.string().nullable(),
  source: z.string().nullable(),
  grade: z.enum(["A", "B", "C"]),
  contact_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  platform: z.string().nullable(),
  platform_account: z.string().nullable(),
});

const ImportCandidateMatchSchema = z.object({
  existing_customer_id: UUIDSchema,
  matched_by: z.array(z.enum(["email", "phone", "platform_account"])).min(1),
  existing: ImportCustomerSnapshotSchema,
  conflicts: z.array(
    z.object({
      field: z.enum([
        "name",
        "company",
        "country",
        "source",
        "grade",
        "contact_name",
        "email",
        "phone",
        "platform",
        "platform_account",
      ]),
      existing_value: z.string(),
      incoming_value: z.string(),
    }),
  ),
});

const ImportNameCompanyHintSchema = z.object({
  row_index: z.number().int(),
  existing_customer_id: UUIDSchema,
  matched_by: z.array(z.enum(["name", "company"])).min(1),
  existing_name: z.string(),
  existing_company: z.string().nullable(),
  incoming_name: z.string(),
  incoming_company: z.string().nullable(),
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
      incoming: ImportCustomerSnapshotSchema,
      matches: z.array(ImportCandidateMatchSchema).min(1),
    }),
  ),
  name_company_hints: z.array(ImportNameCompanyHintSchema).default([]),
  source_columns: z.array(z.string()).default([]),
  preview: z.array(z.record(z.string(), z.any())).max(50),
});

export const ImportCommitResponseSchema = z.object({
  success: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  duplicates: z.number().int(),
  warnings: z
    .array(
      z.object({
        code: z.literal("PLATFORM_ACCOUNT_NOT_COPIED"),
        row_index: z.number().int().positive(),
        field: z.literal("platform_account"),
        platform: z.string(),
        platform_account: z.string(),
        existing_customer_id: UUIDSchema,
      }),
    )
    .default([]),
});
