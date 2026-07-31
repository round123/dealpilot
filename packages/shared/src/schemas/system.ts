/** DealPilot 本地数据生命周期契约。 */

import { z } from "zod";

export const BackupRecommendationSchema = z.enum([
  "first_import",
  "overdue",
  "current",
  "not_needed",
]);

export const LocalDataInfoSchema = z.object({
  data_path: z.string().min(1),
  database_size_bytes: z.number().int().nonnegative(),
  occupied_size_bytes: z.number().int().nonnegative(),
  recovery_size_bytes: z.number().int().nonnegative(),
  last_backup_at: z.string().datetime().nullable(),
  backup_reminder_days: z.number().int().min(1).max(365),
  backup_recommendation: BackupRecommendationSchema,
  has_business_data: z.boolean(),
  auto_start_supported: z.boolean(),
});

export const ClearLocalDataSchema = z.object({
  confirmation: z.literal("CLEAR ALL DATA"),
});

export const ClearLocalDataResponseSchema = z.object({
  success: z.literal(true),
  deleted_records: z.number().int().nonnegative(),
  cleared_at: z.string().datetime(),
  external_backups_preserved: z.literal(true),
});
