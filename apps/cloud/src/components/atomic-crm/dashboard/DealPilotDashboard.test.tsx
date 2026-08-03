import type { DashboardSummary } from "@dealpilot/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as RaCore from "ra-core";
import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";

const mocks = vi.hoisted(() => ({
  getSummary: vi.fn(),
  useGetList: vi.fn(),
}));

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({
    dashboard: { getSummary: mocks.getSummary },
  }),
}));

vi.mock("ra-core", async (importOriginal) => ({
  ...(await importOriginal<typeof RaCore>()),
  useGetList: mocks.useGetList,
}));

import { DealPilotDashboard } from "./DealPilotDashboard";

const summary: DashboardSummary = {
  open_reminder_count: 12_345,
  overdue_reminder_count: 42,
  high_risk_deal_count: 7,
  follow_up_count: 50_001,
  priority_reminders: [
    {
      id: "11111111-1111-4111-8111-111111111111" as DashboardSummary["priority_reminders"][number]["id"],
      company_id:
        "22222222-2222-4222-8222-222222222222" as DashboardSummary["priority_reminders"][number]["company_id"],
      deal_id:
        "33333333-3333-4333-8333-333333333333" as DashboardSummary["priority_reminders"][number]["deal_id"],
      company_name: "上海远景科技",
      deal_name: "云平台升级",
      status: "overdue",
      due_at: "2026-08-01T08:00:00.000Z",
      snooze_until: null,
    },
  ],
};

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DealPilotDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("DealPilotDashboard", () => {
  beforeEach(() => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_IS_DEMO", "false");
    mocks.getSummary.mockReset();
    mocks.useGetList.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("renders exact server aggregates and prioritized reminder labels", async () => {
    mocks.getSummary.mockResolvedValue(summary);

    const screen = await renderDashboard();

    await expect.element(screen.getByText("12345")).toBeVisible();
    await expect.element(screen.getByText("42")).toBeVisible();
    await expect.element(screen.getByText("7")).toBeVisible();
    await expect.element(screen.getByText("50001")).toBeVisible();
    await expect.element(screen.getByText("上海远景科技")).toBeVisible();
    await expect.element(screen.getByText(/云平台升级/)).toBeVisible();
    expect(mocks.getSummary).toHaveBeenCalledOnce();
    expect(mocks.getSummary).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    });
    expect(mocks.useGetList).not.toHaveBeenCalled();
  });

  it("uses the in-memory data provider in demo mode without calling Cloud API", async () => {
    vi.stubEnv("MODE", "demo");
    vi.stubEnv("VITE_IS_DEMO", "true");
    const demoData = {
      companies: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "演示客户",
          grade: "A",
        },
      ],
      deals: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          company_id: "22222222-2222-4222-8222-222222222222",
          name: "演示项目",
          grade: "S",
        },
      ],
      follow_ups: [{ id: "follow-up-1" }, { id: "follow-up-2" }],
      reminders: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          company_id: "22222222-2222-4222-8222-222222222222",
          deal_id: "33333333-3333-4333-8333-333333333333",
          type: "fixed_time",
          status: "pending",
          due_at: "2099-08-02T08:00:00.000Z",
          snooze_until: null,
        },
      ],
      deal_risks: [
        {
          deal_id: "33333333-3333-4333-8333-333333333333",
          severity: "high",
          status: "open",
          handled_at: null,
          created_at: "2026-07-01T08:00:00.000Z",
        },
      ],
    } as const;
    mocks.useGetList.mockImplementation((resource: keyof typeof demoData) => ({
      data: demoData[resource],
      isPending: false,
      isError: false,
    }));

    const screen = await renderDashboard();

    await expect.element(screen.getByText("演示客户")).toBeVisible();
    await expect.element(screen.getByText(/演示项目/)).toBeVisible();
    expect(mocks.getSummary).not.toHaveBeenCalled();
    expect(mocks.useGetList.mock.calls.map(([resource]) => resource)).toEqual([
      "companies",
      "deals",
      "follow_ups",
      "reminders",
      "deal_risks",
    ]);
  });

  it("shows a stable error instead of misleading zero metrics", async () => {
    mocks.getSummary.mockRejectedValue(new Error("cloud query failed"));

    const screen = await renderDashboard();

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("工作台数据加载失败");
    await expect
      .element(screen.getByText("待处理提醒"))
      .not.toBeInTheDocument();
  });
});
