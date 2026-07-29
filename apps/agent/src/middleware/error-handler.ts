/**
 * DealPilot 中间件 - 统一错误处理
 * 封装 ErrorResponse 格式
 */

import type { Context, Next } from "hono";

export async function errorHandlerMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    const requestId = c.get("requestId") ?? "unknown";

    if (err instanceof ApiError) {
      return c.json(
        {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
            request_id: requestId,
          },
        },
        err.status,
      );
    }

    // 未预期的错误
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
}

/**
 * 自定义 API 错误类
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static notFound(message: string) {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message: string) {
    return new ApiError(409, "CONFLICT", message);
  }

  static unauthorized(message: string = "Unauthorized") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message: string = "Forbidden") {
    return new ApiError(403, "FORBIDDEN", message);
  }
}
