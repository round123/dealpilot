import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { API_ERROR_CODES, type ApiClient } from "@dealpilot/api-client";

import { setExtensionApiClient } from "./api-client";
import {
  handleContentCloudRequest,
  isAllowedContentSender,
} from "./background-content-rpc";
import { CONTENT_CLOUD_REQUEST } from "./content-agent-client";

const originalChrome = globalThis.chrome;
const allowedSender = {
  id: "extension-id",
  url: "https://web.whatsapp.com/",
  tab: { id: 12, url: "https://web.whatsapp.com/" },
};

beforeEach(() => {
  globalThis.chrome = { runtime: { id: "extension-id" } } as typeof chrome;
});

afterEach(() => {
  globalThis.chrome = originalChrome;
  setExtensionApiClient(undefined);
  mock.restore();
});

describe("Background Content Script Cloud boundary", () => {
  test("allows only this extension's supported platform tabs", () => {
    expect(isAllowedContentSender(allowedSender)).toBe(true);
    expect(isAllowedContentSender({ ...allowedSender, id: "other-extension" })).toBe(false);
    expect(isAllowedContentSender({ ...allowedSender, url: "https://example.com/" })).toBe(false);
  });

  test("rejects an unlisted operation before dispatch", async () => {
    await expect(
      handleContentCloudRequest(
        { type: CONTENT_CLOUD_REQUEST, operation: "raw_fetch", payload: {} },
        allowedSender,
      ),
    ).resolves.toEqual({
      error: { code: API_ERROR_CODES.validation, status: 400 },
    });
  });

  test("returns typed Cloud data without exposing the session", async () => {
    const session = {
      user: { id: "11111111-1111-4111-8111-111111111111", metadata: {} },
    };
    setExtensionApiClient({
      auth: { getSession: mock(async () => session) },
      list: mock(async () => ({ data: [], total: 0 })),
    } as unknown as ApiClient);

    await expect(
      handleContentCloudRequest(
        {
          type: CONTENT_CLOUD_REQUEST,
          operation: "resolve_match",
          payload: { platform: "telegram", raw_identifier: "@buyer" },
        },
        allowedSender,
      ),
    ).resolves.toEqual({
      data: { status: "none", match_method: null },
    });
  });

  test("rejects a non-UUID follow-up idempotency key before dispatch", async () => {
    await expect(
      handleContentCloudRequest(
        {
          type: CONTENT_CLOUD_REQUEST,
          operation: "create_follow_up",
          payload: {
            data: {
              customer_id: "22222222-2222-4222-8222-222222222222",
              type: "note",
              note: "Called the customer",
              occurred_at: "2026-08-01T09:00:00.000Z",
            },
            idempotency_key: "retry-key",
          },
        },
        allowedSender,
      ),
    ).resolves.toEqual({
      error: { code: API_ERROR_CODES.validation, status: 400 },
    });
  });

  test("requires a UUID idempotency key for reminder state commands", async () => {
    await expect(
      handleContentCloudRequest(
        {
          type: CONTENT_CLOUD_REQUEST,
          operation: "update_reminder_status",
          payload: {
            reminder_id: "22222222-2222-4222-8222-222222222222",
            data: { status: "completed" },
            idempotency_key: "retry-key",
          },
        },
        allowedSender,
      ),
    ).resolves.toEqual({
      error: { code: API_ERROR_CODES.validation, status: 400 },
    });
  });

  test("normalizes Cloud authentication errors for Content Script", async () => {
    setExtensionApiClient({
      auth: { getSession: mock(async () => null) },
    } as unknown as ApiClient);

    await expect(
      handleContentCloudRequest(
        {
          type: CONTENT_CLOUD_REQUEST,
          operation: "resolve_match",
          payload: { platform: "telegram", raw_identifier: "@buyer" },
        },
        allowedSender,
      ),
    ).resolves.toEqual({
      error: {
        code: API_ERROR_CODES.unauthorized,
        status: 401,
        request_id: expect.any(String),
      },
    });
  });
});
