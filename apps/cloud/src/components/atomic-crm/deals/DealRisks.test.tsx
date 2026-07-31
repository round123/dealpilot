import { render } from "vitest-browser-react";
import type * as RaCore from "ra-core";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  optimisticMutate: vi.fn(),
  notify: vi.fn(),
  listResult: {
    data: [] as unknown[],
    isPending: false,
    error: null as unknown,
  },
}));

vi.mock("./useOptimisticResourcePatch", () => ({
  useOptimisticResourcePatch: () => ({
    isPending: false,
    mutate: mocks.optimisticMutate,
  }),
}));

vi.mock("ra-core", async (importOriginal) => {
  const actual = await importOriginal<typeof RaCore>();
  return {
    ...actual,
    useCreate: () => [mocks.create, { isPending: false }],
    useDelete: () => [mocks.remove, { isPending: false }],
    useGetList: () => mocks.listResult,
    useNotify: () => mocks.notify,
    useTranslate: () => (_key: string, options?: { _: string }) =>
      options?._ ?? _key,
    useUpdate: () => [mocks.update, { isPending: false }],
  };
});

import { DealRisks, type DealRisk } from "./DealRisks";

const risk: DealRisk = {
  id: "risk-1",
  deal_id: "deal-1",
  description: "Buyer approval may slip",
  severity: "high",
  status: "open",
  handled_at: null,
  created_at: "2026-07-30T00:00:00.000Z",
};

describe("DealRisks", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.remove.mockReset();
    mocks.update.mockReset();
    mocks.optimisticMutate.mockReset();
    mocks.notify.mockReset();
    mocks.listResult = { data: [risk], isPending: false, error: null };
  });

  it("updates status and records handled_at when a risk is resolved", async () => {
    const screen = await render(<DealRisks dealId="deal-1" />);

    await screen
      .getByRole("combobox", { name: "更新风险状态" })
      .selectOptions("resolved");

    expect(mocks.optimisticMutate).toHaveBeenCalledWith({
      record: risk,
      data: {
        status: "resolved",
        handled_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
    });
  });

  it("creates, edits, and deletes risks through the independent resource", async () => {
    const screen = await render(<DealRisks dealId="deal-1" />);

    await screen.getByRole("button", { name: "添加风险" }).click();
    await screen.getByLabelText("风险描述").fill("Port congestion");
    await screen.getByLabelText("严重程度").selectOptions("critical");
    await screen.getByRole("button", { name: "保存风险" }).click();

    expect(mocks.create).toHaveBeenCalledWith(
      "deal_risks",
      {
        data: {
          deal_id: "deal-1",
          description: "Port congestion",
          severity: "critical",
          status: "open",
          handled_at: null,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    await screen.getByRole("button", { name: "取消" }).click();
    await screen.getByRole("button", { name: "编辑风险" }).click();
    const description = screen.getByLabelText("风险描述");
    await description.clear();
    await description.fill("Buyer approval is confirmed");
    await screen.getByRole("button", { name: "保存修改" }).click();

    expect(mocks.update).toHaveBeenCalledWith(
      "deal_risks",
      expect.objectContaining({
        id: risk.id,
        data: expect.objectContaining({
          description: "Buyer approval is confirmed",
        }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    await screen.getByRole("button", { name: "取消" }).click();
    await screen.getByRole("button", { name: "删除风险" }).click();
    expect(mocks.remove).toHaveBeenCalledWith(
      "deal_risks",
      { id: risk.id, previousData: risk },
      expect.objectContaining({ mutationMode: "undoable" }),
    );
  });
});
