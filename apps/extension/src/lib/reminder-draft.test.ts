import { describe, expect, test } from "bun:test";
import { ReminderType } from "@dealpilot/shared";
import { buildReminderCreate } from "./reminder-draft";

const customerId = "11111111-1111-4111-8111-111111111111";

describe("extension reminder draft", () => {
  test("requires and trims a pause reason", () => {
    expect(() => buildReminderCreate({
      customerId,
      type: ReminderType.PAUSED,
      priority: "normal",
      dueAt: "",
      pauseReason: "   ",
      reevaluateAt: "",
    })).toThrow("暂不跟进时必须填写原因");

    expect(buildReminderCreate({
      customerId,
      type: ReminderType.PAUSED,
      priority: "normal",
      dueAt: "",
      pauseReason: "  等待下一年度预算  ",
      reevaluateAt: "2026-08-15T09:30",
    })).toMatchObject({
      type: ReminderType.PAUSED,
      pause_reason: "等待下一年度预算",
      reevaluate_at: new Date("2026-08-15T09:30").toISOString(),
    });
  });

  test("keeps waiting-reply reminders compatible with the due-time contract", () => {
    expect(buildReminderCreate({
      customerId,
      type: ReminderType.WAITING_REPLY,
      priority: "high",
      dueAt: "",
      pauseReason: "",
      reevaluateAt: "",
    }, new Date("2026-07-31T00:00:00.000Z"))).toMatchObject({
      type: ReminderType.WAITING_REPLY,
      due_at: "2026-08-01T00:00:00.000Z",
      priority: "high",
    });
  });
});
