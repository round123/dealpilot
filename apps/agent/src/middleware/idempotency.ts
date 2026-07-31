/**
 * DealPilot 中间件 - 幂等性校验
 * 基于 Idempotency-Key 头，内存缓存 + TTL 24h
 * 重复请求返回首次结果
 */

import type { Context, Next } from "hono";
import { IDEMPOTENCY_KEY_TTL_HOURS } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";

interface CachedResponse {
  status: number;
  body: Uint8Array;
  headers: [string, string][];
}

interface StoredResponse {
  response: CachedResponse;
  expiresAt: number;
  fingerprint: string;
}

interface InFlightResponse {
  fingerprint: string;
  promise: Promise<CachedResponse>;
}

const idempotencyStore = new Map<string, StoredResponse>();
const inFlightStore = new Map<string, InFlightResponse>();
const TTL_MS = IDEMPOTENCY_KEY_TTL_HOURS * 60 * 60 * 1000;

// 定期清理过期条目
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of idempotencyStore) {
      if (entry.expiresAt <= now) {
        idempotencyStore.delete(key);
      }
    }
  },
  60 * 60 * 1000,
); // 每小时清理一次

export async function idempotencyMiddleware(c: Context, next: Next) {
  const idempotencyKey = c.req.header("Idempotency-Key");
  if (!idempotencyKey) {
    await next();
    return;
  }

  const url = new URL(c.req.url);
  const scope = `${c.req.method}:${url.pathname}${url.search}:${idempotencyKey}`;
  const fingerprint = await requestFingerprint(c);
  const cached = idempotencyStore.get(scope);
  if (cached && cached.expiresAt > Date.now()) {
    ensureSameRequest(cached.fingerprint, fingerprint);
    return replay(cached.response);
  }

  const inFlight = inFlightStore.get(scope);
  if (inFlight) {
    ensureSameRequest(inFlight.fingerprint, fingerprint);
    return replay(await inFlight.promise);
  }

  const promise = (async () => {
    await next();
    return capture(c.res);
  })();
  inFlightStore.set(scope, { fingerprint, promise });

  try {
    const response = await promise;
    // Cache successful and client-error responses. Server errors remain retryable.
    if (response.status >= 200 && response.status < 500) {
      idempotencyStore.set(scope, {
        response,
        fingerprint,
        expiresAt: Date.now() + TTL_MS,
      });
    }
  } finally {
    inFlightStore.delete(scope);
  }
}

async function requestFingerprint(c: Context): Promise<string> {
  const body = await c.req.raw.clone().arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", body);
  return `${c.req.header("content-type") ?? ""}:${Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function ensureSameRequest(expected: string, received: string) {
  if (expected !== received) {
    throw ApiError.conflict(
      "Idempotency key was already used with a different request body",
    );
  }
}

async function capture(response: Response): Promise<CachedResponse> {
  return {
    status: response.status,
    body: new Uint8Array(await response.clone().arrayBuffer()),
    headers: Array.from(response.headers.entries()),
  };
}

function replay(response: CachedResponse): Response {
  return new Response(response.body.slice(), {
    status: response.status,
    headers: response.headers,
  });
}
