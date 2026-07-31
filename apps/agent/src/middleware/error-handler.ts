/**
 * DealPilot 中间件 - 统一错误处理
 * 封装 ErrorResponse 格式
 */

import type { Context, Next } from "hono";
import { ApiError } from "../errors/api-error";
import type { AppEnv } from "../types/hono";

export { ApiError } from "../errors/api-error";

export function handleError(err: unknown, c: Context<AppEnv>) {
  const requestId = c.get("requestId") ?? "unknown";
  const normalizedError = isStorageCapacityError(err)
    ? ApiError.storage()
    : err;

  if (normalizedError instanceof ApiError) {
    return c.json(
      {
        error: {
          code: normalizedError.code,
          message: normalizedError.message,
          details: normalizedError.details,
          fields: normalizedError.fields,
          request_id: requestId,
        },
      },
      normalizedError.status,
    );
  }

  console.error("[error-handler] Unhandled error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        request_id: requestId,
      },
    },
    500,
  );
}

const STORAGE_ERROR_CODES = new Set([
  "SQLITE_FULL",
  "ENOSPC",
  "EDQUOT",
  "ERROR_DISK_FULL",
  "ERROR_HANDLE_DISK_FULL",
]);
const STORAGE_ERROR_MESSAGE =
  /database or disk is full|disk full|no space left on device|not enough space on (?:the )?disk/i;

export function isStorageCapacityError(error: unknown): boolean {
  const visited = new Set<object>();
  let current: unknown = error;
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (
      (typeof candidate.code === "string" && STORAGE_ERROR_CODES.has(candidate.code)) ||
      (typeof candidate.message === "string" && STORAGE_ERROR_MESSAGE.test(candidate.message))
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

export async function errorHandlerMiddleware(c: Context<AppEnv>, next: Next) {
  try {
    await next();
  } catch (err) {
    return handleError(err, c);
  }
}
