import { QueryClient } from "@tanstack/react-query";
import type { Store } from "ra-core";

const PERSISTED_QUERY_CACHE_KEY = "REACT_QUERY_OFFLINE_CACHE";

export const createCloudQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24,
        networkMode: "offlineFirst",
      },
      mutations: {
        networkMode: "offlineFirst",
      },
    },
  });

export const clearAccountState = (
  queryClient: QueryClient,
  store: Store,
  storage: Pick<Storage, "removeItem"> | undefined =
    typeof window === "undefined" ? undefined : window.localStorage,
) => {
  queryClient.clear();
  store.reset();
  storage?.removeItem(PERSISTED_QUERY_CACHE_KEY);
  storage?.removeItem("RaStore.auth.is_initialized");
  storage?.removeItem("RaStore.auth.current_sale");
};
