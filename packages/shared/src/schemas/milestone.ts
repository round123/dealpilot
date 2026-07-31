/**
 * DealPilot 里程碑 Zod schema
 */

import { z } from "zod";
import { CursorPaginationSchema, UUIDSchema } from "./common.js";

export const MilestoneListQuerySchema = CursorPaginationSchema.extend({
  cursor: UUIDSchema.optional(),
  project_id: UUIDSchema.optional(),
});

export const MilestoneCreateSchema = z.object({
  name: z.string().min(1, "里程碑名称不能为空").max(200),
  date: z.string().min(1, "日期不能为空"),
  completed: z.boolean().optional().default(false),
});

export const MilestoneUpdateSchema = z
  .object({
    name: z.string().min(1, "里程碑名称不能为空").max(200).optional(),
    date: z.string().min(1, "日期不能为空").optional(),
    completed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个要更新的字段",
  });

export const MilestoneSchema = z.object({
  id: UUIDSchema,
  project_id: UUIDSchema,
  name: z.string(),
  date: z.string(),
  completed: z.boolean(),
  created_at: z.string(),
});
