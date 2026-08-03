import {
  CustomerReminderSchema,
  DealRiskSchema,
} from "@dealpilot/api-client";
import { describe, expect, it } from "vitest";

import { sortRemindersByPriority } from "./reminderPriority";

const NOW = new Date("2026-07-31T12:00:00.000Z");

describe("sortRemindersByPriority", () => {
  it("sorts by overdue, risk, grade, and due time in that order", () => {
    const reminders = [
      reminder("due-first", "customer-c", "2026-08-01T09:00:00.000Z"),
      reminder("grade-first", "customer-a", "2026-08-02T09:00:00.000Z"),
      reminder(
        "risk-first",
        "customer-c",
        "2026-08-03T09:00:00.000Z",
        "deal-risk",
      ),
      reminder("overdue-first", "customer-c", "2026-07-30T09:00:00.000Z"),
    ];

    const sorted = sortRemindersByPriority(reminders, {
      now: NOW,
      companies: [
        { id: fixtureId("customer-a"), grade: "A" },
        { id: fixtureId("customer-c"), grade: "C" },
      ],
      deals: [
        {
          id: fixtureId("deal-risk"),
          company_id: fixtureId("customer-c"),
          grade: "C",
        },
      ],
      risks: [
        DealRiskSchema.parse({
          id: fixtureId("risk-1"),
          owner_user_id: "10000000-0000-4000-8000-000000000001",
          deal_id: fixtureId("deal-risk"),
          description: "交付风险",
          severity: "critical",
          status: "open",
          handled_at: null,
          created_at: "2026-07-30T09:00:00.000Z",
          updated_at: "2026-07-30T09:00:00.000Z",
        }),
      ],
    });

    expect(sorted.map(({ id }) => id)).toEqual(
      ["overdue-first", "risk-first", "grade-first", "due-first"].map(
        fixtureId,
      ),
    );
  });

  it("uses project grade before customer grade for project reminders", () => {
    const sorted = sortRemindersByPriority(
      [
        reminder("customer-a", "customer-a", "2026-08-01T09:00:00.000Z"),
        reminder(
          "project-s",
          "customer-c",
          "2026-08-02T09:00:00.000Z",
          "deal-s",
        ),
      ],
      {
        now: NOW,
        companies: [
          { id: fixtureId("customer-a"), grade: "A" },
          { id: fixtureId("customer-c"), grade: "C" },
        ],
        deals: [
          {
            id: fixtureId("deal-s"),
            company_id: fixtureId("customer-c"),
            grade: "S",
          },
        ],
        risks: [],
      },
    );

    expect(sorted.map(({ id }) => id)).toEqual(
      ["project-s", "customer-a"].map(fixtureId),
    );
  });

  it("keeps input order when every priority dimension ties", () => {
    const reminders = [
      reminder("first", "customer-c", "2026-08-01T09:00:00.000Z"),
      reminder("second", "customer-c", "2026-08-01T09:00:00.000Z"),
    ];

    expect(
      sortRemindersByPriority(reminders, {
        now: NOW,
        companies: [{ id: fixtureId("customer-c"), grade: "C" }],
        deals: [],
        risks: [],
      }).map(({ id }) => id),
    ).toEqual(["first", "second"].map(fixtureId));
  });
});

const reminder = (
  id: string,
  companyId: string,
  dueAt: string,
  dealId?: string,
) => CustomerReminderSchema.parse({
  id: fixtureId(id),
  owner_user_id: "10000000-0000-4000-8000-000000000001",
  company_id: fixtureId(companyId),
  deal_id: dealId ? fixtureId(dealId) : null,
  type: "fixed_time" as const,
  status: "pending" as const,
  due_at: dueAt,
  priority: "normal" as const,
  last_notified_at: null,
  snooze_until: null,
  resolution: null,
  deletion_event_id: null,
  created_at: "2026-07-29T09:00:00.000Z",
  updated_at: "2026-07-29T09:00:00.000Z",
});

const fixtureId = (value: string) => {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return `10000000-0000-4000-8000-${hash.toString(16).padStart(12, "0")}`;
};
