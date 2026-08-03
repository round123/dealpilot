import type { Store } from "ra-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearAccountState, createCloudQueryClient } from "./accountState";

describe("account state isolation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps business query responses in memory only", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const queryClient = createCloudQueryClient();

    queryClient.setQueryData(["contacts"], [{ id: "private-contact" }]);

    expect(queryClient.getQueryData(["contacts"])).toEqual([
      { id: "private-contact" },
    ]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("clears in-memory queries, the RA store, and persisted account caches", () => {
    const queryClient = createCloudQueryClient();
    queryClient.setQueryData(["contacts"], [{ id: "private-contact" }]);

    const store = { reset: vi.fn() } as unknown as Store;
    const storage = { removeItem: vi.fn() };

    clearAccountState(queryClient, store, storage);

    expect(queryClient.getQueryData(["contacts"])).toBeUndefined();
    expect(store.reset).toHaveBeenCalledOnce();
    expect(storage.removeItem).toHaveBeenCalledWith(
      "REACT_QUERY_OFFLINE_CACHE",
    );
    expect(storage.removeItem).toHaveBeenCalledWith(
      "RaStore.auth.is_initialized",
    );
    expect(storage.removeItem).toHaveBeenCalledWith(
      "RaStore.auth.current_sale",
    );
  });
});
