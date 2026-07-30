import {
  CustomerSchema,
  type Customer,
  type ListResult,
} from "@dealpilot/api-client";

import { getCloudApiClient } from "../providers/apiClient";

const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const DELETED_AFTER_EPOCH = "1970-01-01T00:00:00.000Z";

export const loadDeletedCustomers = (
  page: number,
  perPage: number,
  signal?: AbortSignal,
): Promise<ListResult<Customer>> =>
  getCloudApiClient().list("companies", CustomerSchema, {
    filters: {
      deleted_at: { operator: "gt", value: DELETED_AFTER_EPOCH },
    },
    sort: [
      { field: "deleted_at", order: "desc" },
      { field: "id", order: "asc" },
    ],
    pagination: { page, perPage },
    signal,
  }) as unknown as Promise<ListResult<Customer>>;

export const getRestoreWindow = (deletedAt: string, now = Date.now()) => {
  const expiresAt = new Date(deletedAt).getTime() + RESTORE_WINDOW_MS;
  const remainingMs = Math.max(0, expiresAt - now);
  return {
    mayBeExpired: remainingMs === 0,
    remainingDays: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
  };
};
