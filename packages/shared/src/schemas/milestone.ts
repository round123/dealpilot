/**
 * DealPilot 里程碑 Zod schema
 */

import { z } from "zod";
import { UUIDSchema } from "./common.js";

export const MilestoneCreateSchema = z.object({
  name: z.string().min(1, "里程碑名称不能为空").max(200),
  date: z.string().min(1, "日期不能为空"),
});

export const MilestoneUpdateSchema = z.object({
  completed: z.boolean(),
});

export const MilestoneSchema = z.object({
  id: UUIDSchema,
  project_id: UUIDSchema,
  name: z.string(),
  date: z.string(),
  completed: z.boolean(),
  created_at: z.string(),
});
