import type { Context, Next } from "hono";
import { ApiError } from "../errors/api-error";
import { isRestoreInProgress } from "../services/backup-service";

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function restoreGuardMiddleware(c: Context, next: Next) {
  const isRestoreRequest = c.req.path === "/api/v1/backups/restore";
  if (!isRestoreRequest && writeMethods.has(c.req.method) && isRestoreInProgress()) {
    throw ApiError.conflict("Database restore in progress");
  }
  await next();
}
