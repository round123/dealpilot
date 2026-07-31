import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { API_ERROR_CODES } from "@dealpilot/api-client/error";
import { CONTENT_AGENT_REQUEST } from "./content-agent-client";
import { handleContentAgentRequest, isAllowedContentSender } from "./background-content-rpc";

const originalChrome = globalThis.chrome;
const originalFetch = globalThis.fetch;

const allowedSender = {
  id: "extension-id",
  url: "https://web.whatsapp.com/",
  tab: { id: 12, url: "https://web.whatsapp.com/" },
};

const reminder = {
  id: "11111111-1111-4111-8111-111111111111",
  customer_id: "22222222-2222-4222-8222-222222222222",
  project_id: null,
  type: "waiting_reply",
  status: "completed",
  due_at: "2026-08-01T09:00:00.000Z",
  priority: "normal",
  last_notified_at: null,
  completed_at: null,
  snooze_until: null,
  resolution: null,
  pause_reason: null,
  reevaluate_at: null,
  created_at: "2026-07-31T09:00:00.000Z",
  updated_at: "2026-07-31T09:00:00.000Z",
};

beforeEach(() => {
  globalThis.chrome = {
    runtime: { id: "extension-id" },
    storage: {
      session: {
        get: mock(async (key: string) => ({
          [key]: key === "dealpilot_api_token" ? "background-only-token" : 31081,
        })),
      },
    },
  } as unknown as typeof chrome;
});

afterEach(() => {
  globalThis.chrome = originalChrome;
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("Background Content Script request boundary", () => {
  test("allows only this extension's WhatsApp or Telegram tab", () => {
    expect(isAllowedContentSender(allowedSender)).toBe(true);
    expect(isAllowedContentSender({ ...allowedSender, id: "other-extension" })).toBe(false);
    expect(isAllowedContentSender({ ...allowedSender, url: "https://example.com/" })).toBe(false);
    expect(
      isAllowedContentSender({
        id: "extension-id",
        url: "chrome-extension://extension-id/popup.html",
      }),
    ).toBe(false);
  });

  test("rejects an unlisted operation before any Agent fetch", async () => {
    const fetchMock = mock(async () => new Response("never"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      handleContentAgentRequest(
        {
          type: CONTENT_AGENT_REQUEST,
          operation: "raw_fetch",
          payload: { url: "http://127.0.0.1:31081/api/v1/customers" },
        },
        allowedSender,
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: API_ERROR_CODES.validation, status: 400 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("executes an allowed operation with the background session token", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ status: "none", match_method: null })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      handleContentAgentRequest(
        {
          type: CONTENT_AGENT_REQUEST,
          operation: "resolve_match",
          payload: { platform: "telegram", raw_identifier: "@buyer" },
        },
        allowedSender,
      ),
    ).resolves.toEqual({
      ok: true,
      data: { status: "none", match_method: null },
    });

    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(options.headers).toMatchObject({
      Authorization: "Bearer background-only-token",
    });
  });

  test("returns only normalized error metadata to Content Script", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: API_ERROR_CODES.server,
              message: "database secret",
              request_id: "request-1",
            },
          }),
          { status: 500 },
        ),
    ) as unknown as typeof fetch;

    const result = await handleContentAgentRequest(
      {
        type: CONTENT_AGENT_REQUEST,
        operation: "resolve_match",
        payload: { platform: "telegram", raw_identifier: "@buyer" },
      },
      allowedSender,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: API_ERROR_CODES.server,
        status: 500,
        request_id: "request-1",
      },
    });
    expect(JSON.stringify(result)).not.toContain("database secret");
  });

  test("forwards a reminder action without exposing the session token to Content", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ data: reminder })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      handleContentAgentRequest(
        {
          type: CONTENT_AGENT_REQUEST,
          operation: "update_reminder_status",
          payload: {
            reminder_id: reminder.id,
            data: { status: "completed" },
          },
        },
        allowedSender,
      ),
    ).resolves.toEqual({ ok: true, data: reminder });

    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:31081/api/v1/reminders/${reminder.id}`);
    expect(options.method).toBe("PUT");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer background-only-token",
    });
  });
});
