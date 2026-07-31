import { QueryClient } from "@tanstack/react-query";

import {
  restoreResourceSnapshots,
  snapshotAndPatchResource,
} from "./useOptimisticResourcePatch";

describe("optimistic resource patch", () => {
  it("cancels, snapshots, patches list and detail, then rolls back verbatim", async () => {
    const queryClient = new QueryClient();
    const listKey = ["deal_risks", "getList", { deal_id: "deal-1" }] as const;
    const detailKey = ["deal_risks", "getOne", "risk-1"] as const;
    const untouchedKey = ["deal_milestones", "getList"] as const;
    const risk = { id: "risk-1", status: "open", handled_at: null };
    const listBefore = { data: [risk], total: 1 };
    const detailBefore = { data: risk };
    queryClient.setQueryData(listKey, listBefore);
    queryClient.setQueryData(detailKey, detailBefore);
    queryClient.setQueryData(untouchedKey, { data: [{ id: "milestone-1" }] });
    const cancel = vi.spyOn(queryClient, "cancelQueries");

    const snapshots = await snapshotAndPatchResource(
      queryClient,
      "deal_risks",
      "risk-1",
      { status: "resolved", handled_at: "2026-07-30T08:00:00.000Z" },
    );

    expect(cancel).toHaveBeenCalledWith({ queryKey: ["deal_risks"] });
    expect(queryClient.getQueryData(listKey)).toEqual({
      data: [
        {
          ...risk,
          status: "resolved",
          handled_at: "2026-07-30T08:00:00.000Z",
        },
      ],
      total: 1,
    });
    expect(queryClient.getQueryData(detailKey)).toEqual({
      data: {
        ...risk,
        status: "resolved",
        handled_at: "2026-07-30T08:00:00.000Z",
      },
    });

    restoreResourceSnapshots(queryClient, snapshots);
    expect(queryClient.getQueryData(listKey)).toStrictEqual(listBefore);
    expect(queryClient.getQueryData(detailKey)).toStrictEqual(detailBefore);
    expect(queryClient.getQueryData(untouchedKey)).toEqual({
      data: [{ id: "milestone-1" }],
    });
  });
});
