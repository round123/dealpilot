import { useMutation } from "@tanstack/react-query";
import { useDataProvider, type Identifier, type RaRecord } from "ra-core";
import {
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

type ResourcePatch<T extends RaRecord> = {
  record: T;
  data: Partial<T>;
};

type CacheSnapshot = readonly [QueryKey, unknown];

export const useOptimisticResourcePatch = <T extends RaRecord>(
  resource: string,
  options?: { onError?: (error: Error) => void },
) => {
  const dataProvider = useDataProvider();
  const queryClient = useQueryClient();

  return useMutation<
    T,
    Error,
    ResourcePatch<T>,
    { snapshots: CacheSnapshot[] }
  >({
    mutationFn: async ({ record, data }) => {
      const result = await dataProvider.update<T>(resource, {
        id: record.id,
        data,
        previousData: record,
      });
      return result.data;
    },
    onMutate: async ({ record, data }) => ({
      snapshots: await snapshotAndPatchResource(
        queryClient,
        resource,
        record.id,
        data,
      ),
    }),
    onError: (error, _variables, context) => {
      restoreResourceSnapshots(queryClient, context?.snapshots ?? []);
      options?.onError?.(error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [resource] });
    },
    retry: false,
  });
};

export const snapshotAndPatchResource = async <T extends RaRecord>(
  queryClient: QueryClient,
  resource: string,
  id: Identifier,
  patch: Partial<T>,
): Promise<CacheSnapshot[]> => {
  await queryClient.cancelQueries({ queryKey: [resource] });
  const snapshots = queryClient.getQueriesData({ queryKey: [resource] });

  for (const [queryKey, cached] of snapshots) {
    const next = patchCachedResource(cached, id, patch);
    if (next !== cached) queryClient.setQueryData(queryKey, next);
  }

  return snapshots;
};

export const restoreResourceSnapshots = (
  queryClient: QueryClient,
  snapshots: readonly CacheSnapshot[],
) => {
  for (const [queryKey, cached] of snapshots) {
    queryClient.setQueryData(queryKey, cached);
  }
};

const patchCachedResource = <T extends RaRecord>(
  cached: unknown,
  id: Identifier,
  patch: Partial<T>,
) => {
  if (!isDataEnvelope(cached)) return cached;
  if (Array.isArray(cached.data)) {
    if (!cached.data.some((record) => isRecord(record) && record.id === id)) {
      return cached;
    }
    return {
      ...cached,
      data: cached.data.map((record) =>
        isRecord(record) && record.id === id ? { ...record, ...patch } : record,
      ),
    };
  }
  if (isRecord(cached.data) && cached.data.id === id) {
    return { ...cached, data: { ...cached.data, ...patch } };
  }
  return cached;
};

const isDataEnvelope = (value: unknown): value is { data: unknown } =>
  typeof value === "object" && value !== null && "data" in value;

const isRecord = (value: unknown): value is RaRecord =>
  typeof value === "object" && value !== null && "id" in value;
