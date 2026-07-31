import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { API_ERROR_CODES } from "@dealpilot/api-client/error";
import { z } from "zod";
import {
  ApiError,
  apiFetch,
  extensionErrorMessage,
  fetchPopupReminders,
} from "./api-client";

const originalChrome = globalThis.chrome;
const originalFetch = globalThis.fetch;

const TOKEN_STORAGE_KEY = "dealpilot_api_token";
const PORT_STORAGE_KEY = "dealpilot_agent_port";

const popupReminder = {
  id: "11111111-1111-4111-8111-111111111111",
  customer_id: "22222222-2222-4222-8222-222222222222",
  project_id: null,
  type: "fixed_time",
  status: "pending",
  due_at: "2026-08-01T09:00:00.000Z",
  priority: "normal",
  last_notified_at: null,
  snooze_until: null,
  resolution: null,
  created_at: "2026-07-31T09:00:00.000Z",
  updated_at: "2026-07-31T09:00:00.000Z",
  customer_name: "示例客户",
  project_name: "续约项目",
};

function installChromeStorage(values: Record<string, unknown> = {}) {
  const sessionValues = { ...values };
  const sessionGet = mock(async (key: string) => ({ [key]: sessionValues[key] }));
  const sessionSet = mock(async (items: Record<string, unknown>) => {
    Object.assign(sessionValues, items);
  });
  const localRemove = mock(async () => undefined);

  globalThis.chrome = {
    storage: {
      session: { get: sessionGet, set: sessionSet },
      local: { remove: localRemove },
    },
  } as unknown as typeof chrome;

  return { sessionGet, sessionSet, localRemove };
}

function response(body: unknown, init?: ResponseInit): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), init);
}

async function captureError(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("Expected request to fail");
}

beforeEach(() => {
  installChromeStorage({
    [TOKEN_STORAGE_KEY]: "session-token",
    [PORT_STORAGE_KEY]: 31081,
  });
});

afterEach(() => {
  globalThis.chrome = originalChrome;
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("Extension API boundary", () => {
  test("uses the session token and preserves an idempotency key", async () => {
    const fetchMock = mock(async () => response({ data: "created" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      apiFetch(
        "/test",
        z.string(),
        { method: "POST", body: JSON.stringify({ name: "客户" }) },
        "stable-operation-key",
      ),
    ).resolves.toBe("created");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:31081/test");
    expect(options.headers).toEqual({
      Authorization: "Bearer session-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "stable-operation-key",
    });
  });

  test("parses popup display names from a valid Agent response", async () => {
    globalThis.fetch = mock(async () => response([popupReminder])) as unknown as typeof fetch;

    await expect(fetchPopupReminders()).resolves.toEqual([popupReminder]);
  });

  test("rejects ID-only popup reminders at runtime", async () => {
    const idOnly: Partial<typeof popupReminder> = { ...popupReminder };
    delete idOnly.customer_name;
    delete idOnly.project_name;
    globalThis.fetch = mock(async () => response([idOnly])) as unknown as typeof fetch;

    const error = await captureError(() => fetchPopupReminders());
    expect(error.code).toBe(API_ERROR_CODES.invalidResponse);
    expect(error.status).toBe(200);
  });

  test("normalizes an error envelope including fields and request ID", async () => {
    globalThis.fetch = mock(async () => response({
      error: {
        code: API_ERROR_CODES.validation,
        message: "untrusted server message",
        fields: { name: ["required"] },
        request_id: "request-123",
      },
    }, { status: 422 })) as unknown as typeof fetch;

    const error = await captureError(() => apiFetch("/test", z.string()));
    expect(error.code).toBe(API_ERROR_CODES.validation);
    expect(error.status).toBe(422);
    expect(error.fields).toEqual({ name: ["required"] });
    expect(error.requestId).toBe("request-123");
    expect(error.message).toBe("Agent request failed");
  });

  test("normalizes non-JSON server failures", async () => {
    globalThis.fetch = mock(async () => response("gateway unavailable", {
      status: 503,
    })) as unknown as typeof fetch;

    const error = await captureError(() => apiFetch("/test", z.string()));
    expect(error.code).toBe(API_ERROR_CODES.server);
    expect(error.status).toBe(503);
  });

  test("rejects an unparseable successful response", async () => {
    globalThis.fetch = mock(async () => response({ data: { unexpected: true } })) as unknown as typeof fetch;

    const error = await captureError(() => apiFetch("/test", z.string()));
    expect(error.code).toBe(API_ERROR_CODES.invalidResponse);
    expect(error.status).toBe(200);
  });

  test("normalizes network and cancellation failures", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("private network details");
    }) as unknown as typeof fetch;

    const networkError = await captureError(() => apiFetch("/test", z.string()));
    expect(networkError.code).toBe(API_ERROR_CODES.network);

    globalThis.fetch = mock(async () => {
      throw new DOMException("cancelled", "AbortError");
    }) as unknown as typeof fetch;

    const abortedError = await captureError(() => apiFetch("/test", z.string()));
    expect(abortedError.code).toBe(API_ERROR_CODES.aborted);
  });

  test("never exposes arbitrary or server error messages to the UI", () => {
    const fallback = "操作失败，请重试";
    expect(extensionErrorMessage(new Error("database password"), fallback)).toBe(fallback);
    expect(extensionErrorMessage(new ApiError({
      code: API_ERROR_CODES.server,
      message: "database password",
    }), fallback)).toBe(fallback);
    expect(extensionErrorMessage(new ApiError({
      code: API_ERROR_CODES.network,
      message: "private network details",
    }), fallback)).toBe("无法连接本地 Agent，请确认它正在运行");
  });
});
