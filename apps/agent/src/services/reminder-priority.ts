import { OVERDUE_ESCALATION_DAYS } from "@dealpilot/shared";

type PopupCandidate = {
  reminder: { id: string; due_at: string };
  customerGrade: string;
  projectGrade: string | null;
  hasHighRisk: number | boolean;
};

const projectGradeWeight: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };
const customerGradeWeight: Record<string, number> = { A: 3, B: 2, C: 1 };

export function sortPopupReminderCandidates<T extends PopupCandidate>(
  candidates: T[],
  now = new Date(),
): T[] {
  const nowMs = now.getTime();
  const escalationMs = OVERDUE_ESCALATION_DAYS * 24 * 60 * 60 * 1000;
  const overdueWeight = (dueAt: string) => {
    const age = nowMs - new Date(dueAt).getTime();
    return age >= escalationMs ? 2 : age > 0 ? 1 : 0;
  };
  const gradeWeight = (candidate: T) => candidate.projectGrade
    ? projectGradeWeight[candidate.projectGrade] ?? 0
    : customerGradeWeight[candidate.customerGrade] ?? 0;

  return [...candidates].sort((a, b) =>
    overdueWeight(b.reminder.due_at) - overdueWeight(a.reminder.due_at)
    || Number(b.hasHighRisk) - Number(a.hasHighRisk)
    || gradeWeight(b) - gradeWeight(a)
    || new Date(a.reminder.due_at).getTime() - new Date(b.reminder.due_at).getTime()
    || a.reminder.id.localeCompare(b.reminder.id),
  );
}
