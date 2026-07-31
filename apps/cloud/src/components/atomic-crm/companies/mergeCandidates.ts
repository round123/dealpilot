import type {
  Customer,
  CustomerSummary,
  ListResult,
} from "@dealpilot/api-client";

import type { CustomerOperations } from "../providers/customerOperations";

export const loadMergeCandidates = (
  operations: CustomerOperations,
  sourceId: Customer["id"],
  search: string,
  page: number,
  perPage: number,
  signal?: AbortSignal,
): Promise<ListResult<CustomerSummary>> =>
  operations.listMergeCandidates({
    sourceId,
    search,
    page,
    perPage,
    signal,
  });
