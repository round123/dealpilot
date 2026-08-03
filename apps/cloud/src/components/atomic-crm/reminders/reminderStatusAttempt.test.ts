import { describe, expect, it } from "vitest";
import { createReminderStatusAttemptStore } from "./reminderStatusAttempt";

describe("Cloud reminder status attempts", () => {
  it("reuses the exact UUID and payload for an explicit retry", () => {
    let sequence = 0;
    const attempts = createReminderStatusAttemptStore(
      () => `44444444-4444-4444-8444-${String(++sequence).padStart(12, "0")}`,
    );
    const first = attempts.get("snooze-one-day", () => ({
      status: "snoozed",
      snooze_until: "2026-08-03T08:00:00.000Z",
    }));
    const retry = attempts.get("snooze-one-day", () => ({
      status: "snoozed",
      snooze_until: "2026-08-04T08:00:00.000Z",
    }));

    expect(retry).toEqual(first);
    attempts.complete();
    expect(
      attempts.get("snooze-one-day", () => ({
        status: "snoozed",
        snooze_until: "2026-08-04T08:00:00.000Z",
      })),
    ).not.toEqual(first);
  });
});
