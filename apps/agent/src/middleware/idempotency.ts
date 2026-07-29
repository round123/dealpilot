/**
 * DealPilot 中间件 - 幂等性校验
 * 基于 Idempotency-Key 头，内存缓存 + TTL 24h
 * 重复请求返回首次结果
 */

import type { Context, Next } from "hono";
import { IDEMPOTENCY_KEY_TTL_HOURS } from "@dealpilot/shared";

interface CachedResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

const idempotencyStore = new Map<string, { response: CachedResponse; expiresAt: number }>();
const TTL_MS = IDEMPOTENCY_KEY_TTL_HOURS * 60 * 60 * 1000;

// 定期清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore) {
    if (entry.expiresAt <= now) {
      idempotencyStore.delete(key);
    }
  }
}, 60 * 60 * 1000); // 每小时清理一次

export async function idempotencyMiddleware(c: Context, next: Next) {
  const idempotencyKey = c.req.header("Idempotency-Key");
  if (!idempotencyKey) {
    await next();
    return;
  }

  const cached = idempotencyStore.get(idempotencyKey);
  if (cached && cached.expiresAt > Date.now()) {
    // 返回缓存的响应
    for (const [key, value] of Object.entries(cached.response.headers)) {
      c.header(key, value);
    }
    return c.json(cached.response.body, cached.response.status as 200);
  }

  // 执行请求，捕获响应
  await next();

  // 缓存响应
  const response: CachedResponse = {
    status: c.res.status,
    body: await c.res.clone().json().catch(() => null),
    headers: {},
  };

  // 只缓存 2xx 和 4xx（不缓存 5xx，允许重试）
  if (response.status >= 200 && response.status < 500) {
    idempotencyStore.set(idempotencyKey, {
      response,
      expiresAt: Date.now() + TTL_MS,
    });
  }
}
