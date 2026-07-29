/**
 * DealPilot 备份 Zod schema
 */

import { z } from "zod";

export const BackupCreateSchema = z.object({
  password: z.string().min(8, "备份密码至少 8 位"),
});

export const BackupValidateResponseSchema = z.object({
  valid: z.boolean(),
  schema_version: z.number().int().optional(),
  app_version: z.string().optional(),
  integrity_ok: z.boolean(),
});

export const BackupRestoreResponseSchema = z.object({
  success: z.boolean(),
  rows_restored: z.number().int(),
});
