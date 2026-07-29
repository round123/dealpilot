/**
 * DealPilot 中间件 - 请求追踪 ID
 * 为每个请求生成唯一 ID，用于日志追踪和错误响应
 */

import type { Context, Next } from "hono";
import { generateUUID } from "@dealpilot/shared";

export async function requestIdMiddleware(c: Context, next: Next) {
  const existingId = c.req.header("X-Request-Id");
  const requestId = existingId || generateUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
}
