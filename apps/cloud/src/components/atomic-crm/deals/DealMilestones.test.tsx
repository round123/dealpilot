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

import { DealMilestones, type DealMilestone } from "./DealMilestones";

const milestone: DealMilestone = {
  id: "milestone-1",
  deal_id: "deal-1",
  name: "Approve samples",
  due_date: "2026-08-15",
  completed: false,
};

describe("DealMilestones", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.remove.mockReset();
    mocks.update.mockReset();
    mocks.optimisticMutate.mockReset();
    mocks.notify.mockReset();
    mocks.listResult = { data: [milestone], isPending: false, error: null };
  });

  it("toggles milestone completion through deal_milestones", async () => {
    const screen = await render(<DealMilestones dealId="deal-1" />);

    await screen.getByRole("checkbox", { name: "切换里程碑完成状态" }).click();

    expect(mocks.optimisticMutate).toHaveBeenCalledWith({
      record: milestone,
      data: { completed: true },
    });
  });

  it("creates, edits, and deletes milestones through the independent resource", async () => {
    const screen = await render(<DealMilestones dealId="deal-1" />);

    await screen.getByRole("button", { name: "添加里程碑" }).click();
    await screen.getByLabelText("里程碑名称").fill("Receive deposit");
    const dueDate = screen.getByLabelText("截止日期");
    await dueDate.clear();
    await dueDate.fill("2026-09-01");
    await screen.getByRole("button", { name: "保存里程碑" }).click();

    expect(mocks.create).toHaveBeenCalledWith(
      "deal_milestones",
      {
        data: {
          deal_id: "deal-1",
          name: "Receive deposit",
          due_date: "2026-09-01",
          completed: false,
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    await screen.getByRole("button", { name: "取消" }).click();
    await screen.getByRole("button", { name: "编辑里程碑" }).click();
    const name = screen.getByLabelText("里程碑名称");
    await name.clear();
    await name.fill("Approve production samples");
    await screen.getByRole("button", { name: "保存修改" }).click();

    expect(mocks.update).toHaveBeenCalledWith(
      "deal_milestones",
      expect.objectContaining({
        id: milestone.id,
        data: expect.objectContaining({ name: "Approve production samples" }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );

    await screen.getByRole("button", { name: "取消" }).click();
    await screen.getByRole("button", { name: "删除里程碑" }).click();
    expect(mocks.remove).toHaveBeenCalledWith(
      "deal_milestones",
      { id: milestone.id, previousData: milestone },
      expect.objectContaining({ mutationMode: "undoable" }),
    );
  });
});
