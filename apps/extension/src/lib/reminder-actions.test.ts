import { describe, expect, test } from "bun:test";
import {
  buildReminderStatusUpdate,
  createReminderActionAttemptStore,
} from "./reminder-actions";

describe("extension reminder actions", () => {
  test("maps terminal actions to the shared reminder contract", () => {
    expect(buildReminderStatusUpdate("complete")).toEqual({ status: "completed" });
    expect(buildReminderStatusUpdate("ignore")).toEqual({ status: "ignored" });
    expect(buildReminderStatusUpdate("reply_received")).toEqual({ status: "replied" });
  });

  test("snoozes for one day using a stable payload", () => {
    expect(buildReminderStatusUpdate(
      "snooze",
      new Date("2026-07-31T08:00:00.000Z"),
    )).toEqual({
      status: "snoozed",
      snooze_until: "2026-08-01T08:00:00.000Z",
    });
  });

  test("reuses the UUID and payload until the same user action succeeds", () => {
    let sequence = 0;
    const attempts = createReminderActionAttemptStore(
      () => `44444444-4444-4444-8444-${String(++sequence).padStart(12, "0")}`,
    );
    const first = attempts.get(
      "33333333-3333-4333-8333-333333333333",
      "snooze",
      new Date("2026-08-02T08:00:00.000Z"),
    );
    const retry = attempts.get(
      "33333333-3333-4333-8333-333333333333",
      "snooze",
      new Date("2026-08-03T08:00:00.000Z"),
    );

    expect(retry).toEqual(first);
    attempts.complete(
      "33333333-3333-4333-8333-333333333333",
      "snooze",
    );
    expect(
      attempts.get(
        "33333333-3333-4333-8333-333333333333",
        "snooze",
        new Date("2026-08-03T08:00:00.000Z"),
      ).idempotencyKey,
    ).not.toBe(first.idempotencyKey);
  });
});
