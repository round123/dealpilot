import { SOFT_DELETE_RETENTION_DAYS } from "@dealpilot/shared";
import { deleteExpiredCustomers } from "../repositories/system-repository";

export function cleanupExpiredCustomers(now: Date = new Date()) {
  const retentionMs = SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return deleteExpiredCustomers(new Date(now.getTime() - retentionMs).toISOString());
}
