import { z } from "zod";
import type { ApiClient, ApiRequestOptions } from "./gateway.js";
import { CustomerIdSchema, DealIdSchema, ReminderIdSchema } from "./ids.js";

const DateTimeSchema = z.string().datetime({ offset: true });

export const DashboardPriorityReminderSchema = z
  .object({
    id: ReminderIdSchema,
    company_id: CustomerIdSchema,
    deal_id: DealIdSchema.nullable(),
    company_name: z.string().min(1),
    deal_name: z.string().min(1).nullable(),
    status: z.enum(["pending", "snoozed", "overdue"]),
    due_at: DateTimeSchema,
    snooze_until: DateTimeSchema.nullable(),
  })
  .strict();

export const DashboardSummarySchema = z
  .object({
    open_reminder_count: z.number().int().nonnegative(),
    overdue_reminder_count: z.number().int().nonnegative(),
    high_risk_deal_count: z.number().int().nonnegative(),
    follow_up_count: z.number().int().nonnegative(),
    priority_reminders: z.array(DashboardPriorityReminderSchema).max(5),
  })
  .strict();

export type DashboardPriorityReminder = z.infer<
  typeof DashboardPriorityReminderSchema
>;
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export interface DashboardApi {
  getSummary(options?: ApiRequestOptions): Promise<DashboardSummary>;
}

type DashboardRpcClient = Pick<ApiClient, "rpc">;

export function createDashboardApi(client: DashboardRpcClient): DashboardApi {
  return {
    getSummary(options) {
      return client.rpc(
        "get_dashboard_summary",
        undefined,
        DashboardSummarySchema,
        options,
      ) as Promise<DashboardSummary>;
    },
  };
}
