import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";
import type * as RaCore from "ra-core";

const mocks = vi.hoisted(() => ({
  failedResource: "" as string,
}));

vi.mock("ra-core", async (importOriginal) => {
  const actual = await importOriginal<typeof RaCore>();
  return {
    ...actual,
    useGetList: (resource: string) => ({
      data: [],
      isPending: false,
      isError: resource === mocks.failedResource,
      error:
        resource === mocks.failedResource
          ? new Error("cloud query failed")
          : null,
    }),
  };
});

import { DealPilotDashboard } from "./DealPilotDashboard";

describe("DealPilotDashboard", () => {
  beforeEach(() => {
    mocks.failedResource = "";
  });

  it.each(["companies", "deals", "follow_ups", "reminders", "deal_risks"])(
    "shows an error instead of zero metrics when %s fails",
    async (resource) => {
      mocks.failedResource = resource;

      const screen = await render(
        <MemoryRouter>
          <DealPilotDashboard />
        </MemoryRouter>,
      );

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("工作台数据加载失败");
      await expect
        .element(screen.getByText("待处理提醒"))
        .not.toBeInTheDocument();
    },
  );
});
