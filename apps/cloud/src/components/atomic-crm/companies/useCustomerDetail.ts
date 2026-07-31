import type { CustomerDetail } from "@dealpilot/api-client";
import { useQuery } from "@tanstack/react-query";
import type { Identifier } from "ra-core";

import { useCustomerOperations } from "../providers/CustomerOperationsContext";
import type { CustomerOperations } from "../providers/customerOperations";

export const customerDetailQueryKey = (id: Identifier) =>
  ["customers", "detail", String(id)] as const;

export const loadCustomerDetail = (
  operations: CustomerOperations,
  id: Identifier,
  signal?: AbortSignal,
): Promise<CustomerDetail> =>
  operations.getCustomerDetail(
    String(id) as CustomerDetail["id"],
    { signal },
  );

export const useCustomerDetail = (id: Identifier | undefined) => {
  const operations = useCustomerOperations();
  return useQuery({
    queryKey:
      id === undefined ? ["customers", "detail"] : customerDetailQueryKey(id),
    queryFn: ({ signal }) => loadCustomerDetail(operations, id!, signal),
    enabled: id !== undefined,
    retry: false,
  });
};
