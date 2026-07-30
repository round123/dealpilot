import {
  CustomerSummarySchema,
  type Customer,
  type CustomerSummary,
  type ListResult,
  type ResourceFilters,
} from "@dealpilot/api-client";

import { getCloudApiClient } from "../providers/apiClient";

export const loadMergeCandidates = (
  sourceId: Customer["id"],
  search: string,
  page: number,
  perPage: number,
  signal?: AbortSignal,
): Promise<ListResult<CustomerSummary>> => {
  const filters: Record<string, ResourceFilters[string]> = {
    deleted_at: { operator: "is", value: null },
    id: { operator: "neq", value: sourceId },
  };
  if (search.trim()) {
    filters.search_text = {
      operator: "ilike",
      value: `%${search.trim()}%`,
    };
  }

  return getCloudApiClient().list("companies_summary", CustomerSummarySchema, {
    filters,
    sort: [
      { field: "name", order: "asc" },
      { field: "id", order: "asc" },
    ],
    pagination: { page, perPage },
    signal,
  }) as unknown as Promise<ListResult<CustomerSummary>>;
};
