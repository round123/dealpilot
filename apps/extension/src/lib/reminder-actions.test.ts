import { describe, expect, test } from "bun:test";
import { buildReminderStatusUpdate } from "./reminder-actions";

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
});
