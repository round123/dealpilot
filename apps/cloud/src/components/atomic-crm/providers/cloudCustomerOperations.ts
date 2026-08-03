import {
  CustomerSchema,
  CustomerSummarySchema,
  resolveCustomerMergeFields,
  type ResourceFilters,
} from "@dealpilot/api-client";

import { getCloudApiClient } from "./apiClient";
import { invalidateCustomerCursors } from "./customerCursorState";
import type { CustomerOperations } from "./customerOperations";

const DELETED_AFTER_EPOCH = "1970-01-01T00:00:00.000Z";

export const cloudCustomerOperations: CustomerOperations = {
  getCustomerDetail(id, options) {
    return getCloudApiClient().customers.getCustomerDetail(id, options);
  },

  listMergeCandidates({ sourceId, search, page, perPage, signal }) {
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

    return getCloudApiClient().list(
      "companies_summary",
      CustomerSummarySchema,
      {
        filters,
        sort: [
          { field: "name", order: "asc" },
          { field: "id", order: "asc" },
        ],
        pagination: { page, perPage },
        signal,
      },
    ) as unknown as ReturnType<CustomerOperations["listMergeCandidates"]>;
  },

  listDeletedCustomers({ page, perPage, signal }) {
    return getCloudApiClient().list("companies", CustomerSchema, {
      filters: {
        deleted_at: { operator: "gt", value: DELETED_AFTER_EPOCH },
      },
      sort: [
        { field: "deleted_at", order: "desc" },
        { field: "id", order: "asc" },
      ],
      pagination: { page, perPage },
      signal,
    }) as unknown as ReturnType<CustomerOperations["listDeletedCustomers"]>;
  },

  async softDeleteCustomer(id, options) {
    const customer = await getCloudApiClient().customers.softDeleteCustomer(
      id,
      options,
    );
    invalidateCustomerCursors();
    return customer;
  },

  async restoreCustomer(id, options) {
    const customer = await getCloudApiClient().customers.restoreCustomer(
      id,
      options,
    );
    invalidateCustomerCursors();
    return customer;
  },

  async mergeCustomers(source, target, choices, options) {
    const customer = await getCloudApiClient().customers.mergeCustomers(
      {
        sourceId: source.id,
        targetId: target.id,
        fieldResolutions: resolveCustomerMergeFields(source, target, choices),
      },
      options,
    );
    invalidateCustomerCursors();
    return customer;
  },
};
