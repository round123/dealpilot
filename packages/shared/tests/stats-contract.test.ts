import { describe, expect, test } from "bun:test";
import { ReminderSchema, StatsSchema, UsageMetricsReportSchema } from "../src";

const rolling = {
  window_days: 30 as const,
  window_start: "2026-07-01T00:00:00.000Z",
  window_end: "2026-07-31T00:00:00.000Z",
  on_time_completion: {
    numerator: 18,
    denominator: 20,
    rate: 0.9,
    target: 0.9,
    minimum_sample: 20,
  },
  match_accuracy: { numerator: 19, denominator: 20, rate: 0.95, target: 0.95 },
  reminder_handling: { numerator: 9, denominator: 10, rate: 0.9, target: 0.9 },
};

describe("usage metrics contracts", () => {
  test("accepts rolling metrics and no-sample null rates", () => {
    expect(StatsSchema.parse({
      total_customers: 0,
      total_followups: 0,
      total_reminders: 0,
      pending_reminders: 0,
      overdue_reminders: 0,
      total_projects: 0,
      active_projects: 0,
      completion_rate: 0,
      rolling_30_days: {
        ...rolling,
        reminder_handling: {
          numerator: 0,
          denominator: 0,
          rate: null,
          target: 0.9,
        },
      },
    }).rolling_30_days.reminder_handling.rate).toBeNull();
  });

  test("requires explicit anonymization flags on exported reports", () => {
    expect(UsageMetricsReportSchema.parse({
      report_type: "dealpilot_anonymized_usage_metrics",
      generated_at: "2026-07-31T00:00:00.000Z",
      local_only: true,
      contains_customer_identity: false,
      contains_message_content: false,
      metrics: rolling,
      methodology: {
        on_time_completion: "method",
        match_accuracy: "method",
        reminder_handling: "method",
      },
    }).contains_customer_identity).toBe(false);
  });
});

describe("reminder completion timestamp contract", () => {
  const reminder = {
    id: "d1862722-515c-4b90-a85d-b0d680591c72",
    customer_id: "ab9b1482-8c95-4113-8bf2-6892a9f10a9e",
    project_id: null,
    type: "fixed_time",
    status: "completed",
    due_at: "2026-07-31T00:00:00.000Z",
    priority: "normal",
    last_notified_at: null,
    completed_at: "2026-07-31T00:30:00.000Z",
    snooze_until: null,
    resolution: null,
    pause_reason: null,
    reevaluate_at: null,
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-31T02:00:00.000Z",
  };

  test("accepts a stable completion timestamp or null", () => {
    expect(ReminderSchema.parse(reminder).completed_at).toBe(
      "2026-07-31T00:30:00.000Z",
    );
    expect(ReminderSchema.parse({ ...reminder, completed_at: null }).completed_at)
      .toBeNull();
  });

  test("requires completion timestamp presence in reminder responses", () => {
    const { completed_at: _, ...withoutCompletedAt } = reminder;
    expect(ReminderSchema.safeParse(withoutCompletedAt).success).toBe(false);
  });
});
