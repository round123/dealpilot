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

  if (err instanceof ApiError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          fields: err.fields,
          request_id: requestId,
        },
      },
      err.status,
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

export async function errorHandlerMiddleware(c: Context<AppEnv>, next: Next) {
  try {
    await next();
  } catch (err) {
    return handleError(err, c);
  }
}
