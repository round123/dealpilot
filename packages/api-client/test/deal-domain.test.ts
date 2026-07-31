import { describe, expect, it } from "vitest";

import {
  DealMilestoneSchema,
  DealRiskSchema,
  FollowUpCreateInputSchema,
  ReminderCreateInputSchema,
  ReminderUpdateInputSchema,
  getDealRiskPriorityWeight,
  getMilestoneReminderDueAt,
  milestoneReminderKey,
} from "../src/index.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "a0000000-0000-4000-8000-000000000001";
const DEAL_ID = "e0000000-0000-4000-8000-000000000001";
const RISK_ID = "90000000-0000-4000-8000-000000000001";
const MILESTONE_ID = "80000000-0000-4000-8000-000000000001";
const NOW = "2026-07-30T08:00:00.000Z";

describe("Deal domain contracts", () => {
  it("strictly parses risks and milestones", () => {
    expect(
      DealRiskSchema.parse({
        id: RISK_ID,
        owner_user_id: USER_ID,
        deal_id: DEAL_ID,
        description: "Customer approval is delayed",
        severity: "high",
        status: "open",
        handled_at: null,
        created_at: NOW,
        updated_at: NOW,
      }).severity,
    ).toBe("high");

    expect(
      DealMilestoneSchema.parse({
        id: MILESTONE_ID,
        owner_user_id: USER_ID,
        deal_id: DEAL_ID,
        name: "Confirm quotation",
        due_date: "2026-08-10",
        completed: false,
        created_at: NOW,
        updated_at: NOW,
      }).completed,
    ).toBe(false);
  });

  it("rejects invalid enum values and unknown wire fields", () => {
    expect(() =>
      DealRiskSchema.parse({
        id: RISK_ID,
        owner_user_id: USER_ID,
        deal_id: DEAL_ID,
        description: "Risk",
        severity: "blocker",
        status: "open",
        handled_at: null,
        created_at: NOW,
        updated_at: NOW,
      }),
    ).toThrow();

    expect(() =>
      DealMilestoneSchema.parse({
        id: MILESTONE_ID,
        owner_user_id: USER_ID,
        deal_id: DEAL_ID,
        name: "Ship sample",
        due_date: "2026-08-10",
        completed: false,
        created_at: NOW,
        updated_at: NOW,
        unexpected: true,
      }),
    ).toThrow();
  });

  it("requires message content and direction for message follow-ups", () => {
    const base = {
      company_id: CUSTOMER_ID,
      type: "message",
      occurred_at: NOW,
    } as const;

    expect(() => FollowUpCreateInputSchema.parse(base)).toThrow();
    expect(
      FollowUpCreateInputSchema.parse({
        ...base,
        message_body: "Quoted message",
        message_direction: "outbound",
      }).message_direction,
    ).toBe("outbound");
  });

  it("keeps reminder inputs strict for create and update", () => {
    expect(
      ReminderCreateInputSchema.parse({
        company_id: CUSTOMER_ID,
        type: "fixed_time",
        due_at: NOW,
      }).type,
    ).toBe("fixed_time");

    expect(() =>
      ReminderUpdateInputSchema.parse({ status: "pending", extra: true }),
    ).toThrow();
  });
});

describe("Deal domain rules", () => {
  it("schedules milestone reminders exactly three days before due date", () => {
    expect(getMilestoneReminderDueAt("2026-08-10")).toBe(
      "2026-08-07T09:00:00.000Z",
    );
    expect(milestoneReminderKey({ id: MILESTONE_ID })).toBe(
      `milestone:${MILESTONE_ID}`,
    );
  });

  it("raises an unhandled seven-day risk without mutating its status", () => {
    const risk = {
      severity: "medium",
      status: "open",
      handled_at: null,
      created_at: "2026-07-23T08:00:00.000Z",
    } as const;

    expect(getDealRiskPriorityWeight(risk, new Date(NOW))).toBe(6);
    expect(risk.status).toBe("open");
  });
});
