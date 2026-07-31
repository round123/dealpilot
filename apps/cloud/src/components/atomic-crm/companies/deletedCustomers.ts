import type { Customer, ListResult } from "@dealpilot/api-client";

import type { CustomerOperations } from "../providers/customerOperations";

const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const loadDeletedCustomers = (
  operations: CustomerOperations,
  page: number,
  perPage: number,
  signal?: AbortSignal,
): Promise<ListResult<Customer>> =>
  operations.listDeletedCustomers({
    page,
    perPage,
    signal,
  });

export const getRestoreWindow = (deletedAt: string, now = Date.now()) => {
  const expiresAt = new Date(deletedAt).getTime() + RESTORE_WINDOW_MS;
  const remainingMs = Math.max(0, expiresAt - now);
  return {
    mayBeExpired: remainingMs === 0,
    remainingDays: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
  };
};
