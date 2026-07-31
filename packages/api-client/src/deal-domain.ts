import { z } from "zod";

import {
  DealIdSchema,
  DealMilestoneIdSchema,
  DealRiskIdSchema,
  UserIdSchema,
} from "./ids.js";

const DateTimeSchema = z.string().datetime({ offset: true });

export const DealRiskSchema = z
  .object({
    id: DealRiskIdSchema,
    owner_user_id: UserIdSchema,
    deal_id: DealIdSchema,
    description: z.string().trim().min(1),
    severity: z.enum(["low", "medium", "high", "critical"]),
    status: z.enum(["open", "handling", "resolved", "ignored"]),
    handled_at: DateTimeSchema.nullable(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })
  .strict();

export const DealMilestoneSchema = z
  .object({
    id: DealMilestoneIdSchema,
    owner_user_id: UserIdSchema,
    deal_id: DealIdSchema,
    name: z.string().trim().min(1),
    due_date: z.string().date(),
    completed: z.boolean(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })
  .strict();

export type DealRisk = z.infer<typeof DealRiskSchema>;
export type DealMilestone = z.infer<typeof DealMilestoneSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITY_WEIGHT: Record<DealRisk["severity"], number> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 8,
};

export const MILESTONE_REMINDER_PREFIX = "milestone:";

export const getMilestoneReminderDueAt = (dueDate: string): string => {
  const dueAt = new Date(`${dueDate}T09:00:00.000Z`);
  if (Number.isNaN(dueAt.getTime())) {
    throw new Error("Milestone due_date must be an ISO date");
  }
  return new Date(dueAt.getTime() - 3 * DAY_MS).toISOString();
};

export const getDealRiskPriorityWeight = (
  risk: Pick<DealRisk, "severity" | "status" | "handled_at" | "created_at">,
  now = new Date(),
): number => {
  if (risk.status === "resolved" || risk.status === "ignored") return 0;
  const ageMs = now.getTime() - new Date(risk.created_at).getTime();
  const overdueBonus = !risk.handled_at && ageMs >= 7 * DAY_MS ? 4 : 0;
  return SEVERITY_WEIGHT[risk.severity] + overdueBonus;
};

export const milestoneReminderKey = (milestone: { id: string | number }) =>
  `${MILESTONE_REMINDER_PREFIX}${String(milestone.id)}`;
