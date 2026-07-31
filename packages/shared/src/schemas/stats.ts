/**
 * DealPilot 统计 Zod schema
 */

import { z } from "zod";

export const UsageMetricSchema = z.object({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1).nullable(),
  target: z.number().min(0).max(1),
});

export const RollingUsageMetricsSchema = z.object({
  window_days: z.literal(30),
  window_start: z.string().datetime(),
  window_end: z.string().datetime(),
  on_time_completion: UsageMetricSchema.extend({
    minimum_sample: z.number().int().nonnegative(),
  }),
  match_accuracy: UsageMetricSchema,
  reminder_handling: UsageMetricSchema,
});

export const StatsSchema = z.object({
  total_customers: z.number().int(),
  total_followups: z.number().int(),
  total_reminders: z.number().int(),
  pending_reminders: z.number().int(),
  overdue_reminders: z.number().int(),
  total_projects: z.number().int(),
  active_projects: z.number().int(),
  completion_rate: z.number(),
  rolling_30_days: RollingUsageMetricsSchema,
});

export const UsageMetricsReportSchema = z.object({
  report_type: z.literal("dealpilot_anonymized_usage_metrics"),
  generated_at: z.string().datetime(),
  local_only: z.literal(true),
  contains_customer_identity: z.literal(false),
  contains_message_content: z.literal(false),
  metrics: RollingUsageMetricsSchema,
  methodology: z.object({
    on_time_completion: z.string(),
    match_accuracy: z.string(),
    reminder_handling: z.string(),
  }),
});
