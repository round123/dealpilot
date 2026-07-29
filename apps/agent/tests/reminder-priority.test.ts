import { describe, expect, test } from "bun:test";
import { sortPopupReminderCandidates } from "../src/services/reminder-priority";

const now = new Date("2026-07-29T12:00:00.000Z");

function candidate(
  id: string,
  dueAt: string,
  priority: string,
  customerGrade: string,
  projectGrade: string | null = null,
) {
  return { reminder: { id, due_at: dueAt, priority }, customerGrade, projectGrade };
}

describe("popup reminder ordering", () => {
  test("orders by overdue escalation, priority, grade, and due time", () => {
    const sorted = sortPopupReminderCandidates([
      candidate("future-urgent", "2026-07-30T12:00:00.000Z", "urgent", "A", "S"),
      candidate("overdue-normal-b", "2026-07-29T10:00:00.000Z", "normal", "B"),
      candidate("overdue-high-c", "2026-07-29T11:00:00.000Z", "high", "C"),
      candidate("overdue-high-s", "2026-07-29T11:30:00.000Z", "high", "A", "S"),
      candidate("escalated-low", "2026-07-26T12:00:00.000Z", "low", "C"),
    ], now);

    expect(sorted.map(({ reminder }) => reminder.id)).toEqual([
      "escalated-low",
      "overdue-high-s",
      "overdue-high-c",
      "overdue-normal-b",
      "future-urgent",
    ]);
  });

  test("does not mutate the persisted reminder state", () => {
    const input = [candidate("one", "2026-07-20T12:00:00.000Z", "low", "C")];
    expect(sortPopupReminderCandidates(input, now)[0]).toBe(input[0]);
    expect(input[0].reminder.priority).toBe("low");
  });
});
