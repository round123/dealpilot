/**
 * DealPilot 设置 Zod schema
 */

import { z } from "zod";

export const SettingsSchema = z.object({
  last_backup_at: z.string().nullable(),
  auto_start: z.boolean(),
  minimize_to_tray: z.boolean(),
  backup_reminder_days: z.number().int().nullable(),
  locale: z.string(),
  theme: z.string(),
});

export const SettingsUpdateSchema = z.object({
  auto_start: z.boolean().optional(),
  minimize_to_tray: z.boolean().optional(),
  backup_reminder_days: z.number().int().min(1).max(365).optional(),
  locale: z.string().optional(),
  theme: z.string().optional(),
});
