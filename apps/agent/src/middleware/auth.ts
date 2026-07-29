/**
 * DealPilot 中间件 - Bearer Token 认证
 * 从 Authorization Header 提取 token，与 config 中 token 比对
 */

import type { Context, Next } from "hono";
import { config } from "../config/config";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
          request_id: c.get("requestId") ?? undefined,
        },
      },
      401,
    );
  }

  const token = authHeader.slice(7);
  if (token !== config.token) {
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid token",
          request_id: c.get("requestId") ?? undefined,
        },
      },
      401,
    );
  }

  await next();
}
