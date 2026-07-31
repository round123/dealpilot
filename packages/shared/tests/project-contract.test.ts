import { describe, expect, test } from "bun:test";

import {
  ProjectCreateSchema,
  ProjectDetailSchema,
  ProjectUpdateSchema,
} from "../src/index";

const customerId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const riskId = "33333333-3333-4333-8333-333333333333";
const milestoneId = "44444444-4444-4444-8444-444444444444";

describe("project contracts", () => {
  test("accepts closed_reason on project create and update", () => {
    expect(
      ProjectCreateSchema.parse({
        customer_id: customerId,
        name: "Renewal",
        closed_reason: "Budget deferred",
      }).closed_reason,
    ).toBe("Budget deferred");

    expect(
      ProjectUpdateSchema.parse({ closed_reason: null }).closed_reason,
    ).toBeNull();
  });

  test("keeps complete risk and milestone records in project detail", () => {
    const detail = ProjectDetailSchema.parse({
      id: projectId,
      customer_id: customerId,
      name: "Renewal",
      currency: "CNY",
      amount: 1000,
      probability: 60,
      expected_close_date: "2026-09-30",
      stage: "proposal",
      grade: "A",
      closed_reason: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-30T00:00:00.000Z",
      risks: [
        {
          id: riskId,
          project_id: projectId,
          description: "Approval pending",
          severity: "high",
          status: "resolved",
          handled_at: "2026-07-29T00:00:00.000Z",
          created_at: "2026-07-10T00:00:00.000Z",
        },
      ],
      milestones: [
        {
          id: milestoneId,
          project_id: projectId,
          name: "Sign contract",
          date: "2026-08-15",
          completed: true,
          created_at: "2026-07-11T00:00:00.000Z",
        },
      ],
    });

    expect(detail.risks?.[0]).toMatchObject({
      project_id: projectId,
      handled_at: "2026-07-29T00:00:00.000Z",
      created_at: "2026-07-10T00:00:00.000Z",
    });
    expect(detail.milestones?.[0]).toMatchObject({
      project_id: projectId,
      created_at: "2026-07-11T00:00:00.000Z",
    });
  });
});
