import {
  getDealRiskPriorityWeight,
  type CustomerReminder,
  type DealRisk,
} from "@dealpilot/api-client";

import type { Company, Deal } from "../types";

type PrioritizedDeal = Pick<Deal, "id" | "company_id"> & {
  grade?: "S" | "A" | "B" | "C" | null;
};

type PrioritizedCompany = Pick<Company, "id" | "grade">;

const GRADE_WEIGHT = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
} as const;

export type ReminderPriorityContext = {
  companies: PrioritizedCompany[];
  deals: PrioritizedDeal[];
  risks: DealRisk[];
  now?: Date;
};

export const sortRemindersByPriority = (
  reminders: CustomerReminder[],
  { companies, deals, risks, now = new Date() }: ReminderPriorityContext,
) => {
  const companyById = new Map(
    companies.map((company) => [String(company.id), company]),
  );
  const dealById = new Map(deals.map((deal) => [String(deal.id), deal]));
  const riskWeightByDeal = new Map<string, number>();

  for (const risk of risks) {
    const dealId = String(risk.deal_id);
    riskWeightByDeal.set(
      dealId,
      Math.max(
        riskWeightByDeal.get(dealId) ?? 0,
        getDealRiskPriorityWeight(risk, now),
      ),
    );
  }

  return reminders
    .map((reminder, index) => ({ reminder, index }))
    .sort((left, right) => {
      const leftKey = priorityKey(
        left.reminder,
        companyById,
        dealById,
        riskWeightByDeal,
        now,
      );
      const rightKey = priorityKey(
        right.reminder,
        companyById,
        dealById,
        riskWeightByDeal,
        now,
      );

      return compareDescending(leftKey.overdue, rightKey.overdue)
        || compareDescending(leftKey.risk, rightKey.risk)
        || compareDescending(leftKey.grade, rightKey.grade)
        || leftKey.dueAt - rightKey.dueAt
        || left.index - right.index;
    })
    .map(({ reminder }) => reminder);
};

const priorityKey = (
  reminder: CustomerReminder,
  companyById: Map<string, PrioritizedCompany>,
  dealById: Map<string, PrioritizedDeal>,
  riskWeightByDeal: Map<string, number>,
  now: Date,
) => {
  const deal = reminder.deal_id
    ? dealById.get(String(reminder.deal_id))
    : undefined;
  const company = companyById.get(String(reminder.company_id));
  const dueAt = new Date(reminder.snooze_until ?? reminder.due_at).getTime();

  return {
    overdue: Number(dueAt < now.getTime()),
    risk: deal ? (riskWeightByDeal.get(String(deal.id)) ?? 0) : 0,
    grade: GRADE_WEIGHT[deal?.grade ?? company?.grade ?? "C"],
    dueAt: Number.isNaN(dueAt) ? Number.POSITIVE_INFINITY : dueAt,
  };
};

const compareDescending = (left: number, right: number) => right - left;
