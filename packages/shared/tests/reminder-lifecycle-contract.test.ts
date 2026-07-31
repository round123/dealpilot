import { describe, expect, it } from "bun:test";
import { ReminderCreateSchema } from "../src/schemas/reminder";

const customerId = "00000000-0000-4000-8000-000000000001";

describe("reminder lifecycle contract", () => {
  it("offers optional reevaluation but requires a reason when paused", () => {
    expect(ReminderCreateSchema.safeParse({
      customer_id: customerId,
      type: "paused",
      priority: "normal",
    }).success).toBe(false);
    expect(ReminderCreateSchema.parse({
      customer_id: customerId,
      type: "paused",
      priority: "normal",
      pause_reason: "等待客户下一年度预算",
    })).toMatchObject({ pause_reason: "等待客户下一年度预算" });
  });

  it("requires due_at for fixed and waiting reply reminders", () => {
    const result = ReminderCreateSchema.safeParse({
      customer_id: customerId,
      type: "fixed_time",
      priority: "normal",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.due_at).toEqual(["请选择提醒时间"]);
    }
  });
});
