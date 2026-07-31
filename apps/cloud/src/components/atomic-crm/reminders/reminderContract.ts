import type {
  CustomerId,
  CustomerReminder,
  DealId,
} from "@dealpilot/api-client";

export const REMINDER_TYPES = [
  "fixed_time",
  "waiting_reply",
  "paused",
] as const satisfies ReadonlyArray<CustomerReminder["type"]>;

export const REMINDER_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const satisfies ReadonlyArray<CustomerReminder["priority"]>;

export const REMINDER_STATUSES = [
  "pending",
  "overdue",
  "snoozed",
  "completed",
  "ignored",
  "replied",
] as const satisfies ReadonlyArray<CustomerReminder["status"]>;

export type ReminderFormValues = Pick<
  CustomerReminder,
  "company_id" | "deal_id" | "type" | "due_at" | "priority" | "status"
> & {
  pause_reason?: string;
  reevaluate_at?: string | null;
};

export const createReminderDefaults = (
  defaults: Partial<ReminderFormValues> = {},
): ReminderFormValues => ({
  company_id: "" as CustomerId,
  deal_id: null as DealId | null,
  due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  priority: "normal",
  status: "pending",
  type: "fixed_time",
  ...defaults,
});

export const reminderDueAfterDays = (days: number, now = Date.now()) =>
  new Date(now + days * 86_400_000).toISOString();

export const isUnscheduledPausedReminder = (
  reminder: Pick<CustomerReminder, "type" | "due_at">,
) => reminder.type === "paused" && reminder.due_at.startsWith("9999-12-31");

export const isReminderOverdue = (
  reminder: Pick<CustomerReminder, "status" | "due_at" | "snooze_until">,
  now = new Date(),
) => {
  if (reminder.status === "overdue") return true;
  if (["completed", "ignored", "replied"].includes(reminder.status)) {
    return false;
  }
  const effectiveDueAt = reminder.snooze_until ?? reminder.due_at;
  return new Date(effectiveDueAt).getTime() < now.getTime();
};

export const groupReminder = (
  reminder: CustomerReminder,
  now = new Date(),
): "overdue" | "today" | "upcoming" | "closed" => {
  if (["completed", "ignored", "replied"].includes(reminder.status)) {
    return "closed";
  }
  if (isReminderOverdue(reminder, now)) return "overdue";
  const dueAt = new Date(reminder.snooze_until ?? reminder.due_at);
  return dueAt.toDateString() === now.toDateString() ? "today" : "upcoming";
};
