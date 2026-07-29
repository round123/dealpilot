/**
 * DealPilot 统计 Zod schema
 */

import { z } from "zod";

export const StatsSchema = z.object({
  total_customers: z.number().int(),
  total_followups: z.number().int(),
  total_reminders: z.number().int(),
  pending_reminders: z.number().int(),
  overdue_reminders: z.number().int(),
  total_projects: z.number().int(),
  active_projects: z.number().int(),
  completion_rate: z.number(),
});
