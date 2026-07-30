import type { CustomerDetail } from "@dealpilot/api-client";
import { useQuery } from "@tanstack/react-query";
import type { Identifier } from "ra-core";

import { getCloudApiClient } from "../providers/apiClient";

export const customerDetailQueryKey = (id: Identifier) =>
  ["customers", "detail", id] as const;

export const loadCustomerDetail = (
  id: Identifier,
  signal?: AbortSignal,
): Promise<CustomerDetail> =>
  getCloudApiClient().customers.getCustomerDetail(
    String(id) as CustomerDetail["id"],
    { signal },
  );

export const useCustomerDetail = (id: Identifier | undefined) =>
  useQuery({
    queryKey:
      id === undefined ? ["customers", "detail"] : customerDetailQueryKey(id),
    queryFn: ({ signal }) => loadCustomerDetail(id!, signal),
    enabled: id !== undefined,
    retry: false,
  });
