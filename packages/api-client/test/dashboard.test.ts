import { describe, expect, it, vi } from "vitest";
import {
  API_ERROR_CODES,
  createDashboardApi,
  DashboardSummarySchema,
  type ApiClient,
} from "../src/index.js";

const SUMMARY = {
  open_reminder_count: 12_345,
  overdue_reminder_count: 42,
  high_risk_deal_count: 7,
  follow_up_count: 50_001,
  priority_reminders: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      company_id: "22222222-2222-4222-8222-222222222222",
      deal_id: "33333333-3333-4333-8333-333333333333",
      company_name: "Acme China",
      deal_name: "Cloud rollout",
      status: "overdue",
      due_at: "2026-08-01T08:00:00.000Z",
      snooze_until: null,
    },
  ],
};

const createHarness = () => {
  const rpc = vi.fn();
  const api = createDashboardApi({ rpc } as unknown as Pick<ApiClient, "rpc">);
  return { api, rpc };
};

describe("Dashboard API facade", () => {
  it("loads the owner-scoped aggregate and passes cancellation", async () => {
    const { api, rpc } = createHarness();
    const signal = new AbortController().signal;
    rpc.mockResolvedValue(SUMMARY);

    await expect(api.getSummary({ signal })).resolves.toMatchObject(SUMMARY);
    expect(rpc).toHaveBeenCalledWith(
      "get_dashboard_summary",
      undefined,
      DashboardSummarySchema,
      { signal },
    );
  });

  it("does not require a second success envelope after the gateway unwraps it", async () => {
    const { api, rpc } = createHarness();
    rpc.mockResolvedValue(SUMMARY);

    await expect(api.getSummary()).resolves.toEqual(SUMMARY);
  });

  it("rejects a second success envelope at the RPC schema boundary", () => {
    expect(() => DashboardSummarySchema.parse({ data: SUMMARY })).toThrow();
  });

  it.each([
    { ...SUMMARY, follow_up_count: -1 },
    {
      ...SUMMARY,
      priority_reminders: [
        { ...SUMMARY.priority_reminders[0], status: "completed" },
      ],
    },
    {
      ...SUMMARY,
      priority_reminders: Array.from(
        { length: 6 },
        () => SUMMARY.priority_reminders[0],
      ),
    },
  ])(
    "rejects malformed successful payloads at the RPC schema boundary",
    (payload) => {
      expect(() => DashboardSummarySchema.parse(payload)).toThrow();
    },
  );

  it("preserves normalized gateway failures", async () => {
    const { api, rpc } = createHarness();
    const failure = Object.assign(new Error("offline"), {
      code: API_ERROR_CODES.network,
    });
    rpc.mockRejectedValue(failure);

    await expect(api.getSummary()).rejects.toBe(failure);
  });
});
