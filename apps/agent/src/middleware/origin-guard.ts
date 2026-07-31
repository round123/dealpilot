/**
 * DealPilot 中间件 - Origin 白名单校验
 * 只允许 127.0.0.1 的请求通过
 */

import type { Context, Next } from "hono";
import { config } from "../config/config";

export async function originGuardMiddleware(c: Context, next: Next) {
  const origin = c.req.header("Origin");
  // 无 Origin 头的请求（如 curl）允许通过（本地回环）
  if (!origin) {
    await next();
    return;
  }

  if (!config.allowedOrigins.includes(origin)) {
    return c.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Origin not allowed",
          request_id: c.get("requestId") ?? undefined,
        },
      },
      403,
    );
  }

  c.header("Access-Control-Allow-Origin", origin);
  c.header("Vary", "Origin");
  c.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Idempotency-Key",
  );
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
}
