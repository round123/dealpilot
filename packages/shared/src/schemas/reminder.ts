/**
 * DealPilot 提醒 Zod schema
 */

import { z } from "zod";
import { UUIDSchema, DateTimeSchema } from "./common.js";
import { ReminderType, ReminderStatus, ReminderPriority } from "../types/enums.js";

export const ReminderCreateSchema = z.object({
  customer_id: UUIDSchema,
  project_id: UUIDSchema.optional(),
  type: z.enum([ReminderType.FIXED_TIME, ReminderType.WAITING_REPLY, ReminderType.PAUSED]),
  due_at: DateTimeSchema,
  priority: z.enum([
    ReminderPriority.LOW,
    ReminderPriority.NORMAL,
    ReminderPriority.HIGH,
    ReminderPriority.URGENT,
  ]).optional().default(ReminderPriority.NORMAL),
});

export const ReminderStatusUpdateSchema = z.object({
  status: z.enum([
    ReminderStatus.COMPLETED,
    ReminderStatus.SNOOZED,
    ReminderStatus.IGNORED,
    ReminderStatus.REPLIED,
  ]),
  snooze_until: DateTimeSchema.optional(),
  resolution: z.string().max(500).optional(),
});

export const ReminderSchema = z.object({
  id: UUIDSchema,
  customer_id: UUIDSchema,
  project_id: UUIDSchema.nullable(),
  type: z.string(),
  status: z.string(),
  due_at: z.string(),
  priority: z.string(),
  last_notified_at: z.string().nullable(),
  snooze_until: z.string().nullable(),
  resolution: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Popup reminders include display labels so clients never need to expose IDs. */
export const PopupReminderSchema = ReminderSchema.extend({
  customer_name: z.string().min(1),
  project_name: z.string().nullable(),
});

export const ReminderListQuerySchema = z.object({
  status: z.enum([
    ReminderStatus.PENDING,
    ReminderStatus.COMPLETED,
    ReminderStatus.SNOOZED,
    ReminderStatus.IGNORED,
    ReminderStatus.OVERDUE,
    ReminderStatus.REPLIED,
  ]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort_by: z.enum(["due_at", "priority", "created_at"]).optional().default("due_at"),
});
