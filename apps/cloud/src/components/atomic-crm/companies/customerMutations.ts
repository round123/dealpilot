import {
  API_ERROR_CODES,
  ApiError,
  type Customer,
  type CustomerMergeChoices,
  type CustomerSummary,
  type ListResult,
  resolveCustomerMergeFields,
} from "@dealpilot/api-client";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { getCloudApiClient } from "../providers/apiClient";
import { customerDetailQueryKey } from "./useCustomerDetail";

export const customerCacheKeys = {
  all: ["customers"] as const,
  deletedLists: () => ["customers", "deleted", "list"] as const,
  deletedList: (page: number, perPage: number) =>
    ["customers", "deleted", "list", { page, perPage }] as const,
};

export const softDeleteCustomer = (id: Customer["id"], signal?: AbortSignal) =>
  getCloudApiClient().customers.softDeleteCustomer(id, { signal });

export const restoreCustomer = (id: Customer["id"], signal?: AbortSignal) =>
  getCloudApiClient().customers.restoreCustomer(id, { signal });

export const mergeCustomers = (
  source: Customer,
  target: CustomerSummary,
  choices: CustomerMergeChoices,
  signal?: AbortSignal,
) =>
  getCloudApiClient().customers.mergeCustomers(
    {
      sourceId: source.id,
      targetId: target.id,
      fieldResolutions: resolveCustomerMergeFields(source, target, choices),
    },
    { signal },
  );

export const invalidateCustomerCaches = async (queryClient: QueryClient) => {
  await Promise.all(
    [
      ["companies"],
      customerCacheKeys.all,
      ["contacts"],
      ["deals"],
      ["tasks"],
      ["activity_log"],
      ["contact_notes"],
      ["deal_notes"],
      ["follow_ups"],
      ["reminders"],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
};

export const removeCustomerDetailCaches = (
  queryClient: QueryClient,
  id: Customer["id"],
) => {
  queryClient.removeQueries({ queryKey: customerDetailQueryKey(id) });
  queryClient.removeQueries({ queryKey: ["companies", "getOne"] });
};

type DeletedListSnapshot = readonly [QueryKey, ListResult<Customer>];

export const removeCustomerFromDeletedCaches = (
  queryClient: QueryClient,
  id: Customer["id"],
): DeletedListSnapshot[] => {
  const snapshots: DeletedListSnapshot[] = [];

  for (const [queryKey, list] of queryClient.getQueriesData<
    ListResult<Customer>
  >({ queryKey: customerCacheKeys.deletedLists() })) {
    if (!list) continue;
    snapshots.push([queryKey, list]);
    if (!list.data.some((customer) => customer.id === id)) continue;
    queryClient.setQueryData<ListResult<Customer>>(queryKey, {
      data: list.data.filter((customer) => customer.id !== id),
      total: Math.max(0, list.total - 1),
    });
  }

  return snapshots;
};

export const restoreDeletedCacheSnapshots = (
  queryClient: QueryClient,
  snapshots: readonly DeletedListSnapshot[],
) => {
  for (const [queryKey, list] of snapshots) {
    queryClient.setQueryData(queryKey, list);
  }
};

export const useSoftDeleteCustomer = (options?: {
  onSuccess?: (customer: Customer) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation<Customer, ApiError, Customer["id"]>({
    mutationKey: ["customers", "soft-delete"],
    mutationFn: (id) => softDeleteCustomer(id),
    retry: false,
    onSuccess: (customer, id) => {
      removeCustomerDetailCaches(queryClient, id);
      options?.onSuccess?.(customer);
    },
    onSettled: () => {
      void invalidateCustomerCaches(queryClient);
    },
  });
};

interface RestoreContext {
  snapshots: DeletedListSnapshot[];
}

export const useRestoreCustomer = () => {
  const queryClient = useQueryClient();

  return useMutation<Customer, ApiError, Customer["id"], RestoreContext>({
    mutationKey: ["customers", "restore"],
    mutationFn: (id) => restoreCustomer(id),
    retry: false,
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: customerCacheKeys.deletedLists(),
      });
      return {
        snapshots: removeCustomerFromDeletedCaches(queryClient, id),
      };
    },
    onError: (_error, _id, context) => {
      restoreDeletedCacheSnapshots(queryClient, context?.snapshots ?? []);
    },
    onSettled: () => {
      void invalidateCustomerCaches(queryClient);
    },
  });
};

export const useMergeCustomers = (options?: {
  onSuccess?: (customer: Customer, target: CustomerSummary) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation<
    Customer,
    ApiError,
    {
      source: Customer;
      target: CustomerSummary;
      choices: CustomerMergeChoices;
    }
  >({
    mutationKey: ["customers", "merge"],
    mutationFn: ({ source, target, choices }) =>
      mergeCustomers(source, target, choices),
    retry: false,
    onSuccess: async (customer, { source, target }) => {
      removeCustomerDetailCaches(queryClient, source.id);
      await invalidateCustomerCaches(queryClient);
      options?.onSuccess?.(customer, target);
    },
  });
};

export const isRestoreWindowError = (error: unknown) =>
  error instanceof ApiError &&
  (error.code === API_ERROR_CODES.functionError ||
    error.code === API_ERROR_CODES.conflict) &&
  /customer restore window expired/i.test(error.message);
