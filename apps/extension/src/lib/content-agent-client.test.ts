import { afterEach, describe, expect, mock, test } from "bun:test";
import { API_ERROR_CODES } from "@dealpilot/api-client/error";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CONTENT_AGENT_REQUEST,
  createReminder,
  resolveMatch,
  searchCustomers,
  updateContentReminderStatus,
} from "./content-agent-client";
import { ApiError } from "./extension-errors";

const originalChrome = globalThis.chrome;

const reminder = {
  id: "11111111-1111-4111-8111-111111111111",
  customer_id: "22222222-2222-4222-8222-222222222222",
  project_id: null,
  type: "waiting_reply",
  status: "pending",
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

afterEach(() => {
  globalThis.chrome = originalChrome;
  mock.restore();
});

function installRuntime(response: unknown) {
  const sendMessage = mock((message: unknown, callback: (value: unknown) => void) => {
    callback(response);
  });
  globalThis.chrome = {
    runtime: { sendMessage, lastError: undefined },
  } as unknown as typeof chrome;
  return sendMessage;
}

describe("Content Script background API proxy", () => {
  test("keeps direct Agent and token access out of every Content Script module", () => {
    const root = resolve(import.meta.dir, "../../entrypoints/content");
    const files = readdirSync(root, { recursive: true })
      .filter((file) => /\.(ts|tsx)$/.test(String(file)));
    const source = files.map((file) => readFileSync(join(root, String(file)), "utf8")).join("\n");
    expect(source).not.toContain("src/lib/api-client");
    expect(source).not.toContain("src/lib/workbench-links");
    expect(source).not.toContain("getStoredToken");
    expect(source).not.toContain("storage.session");
    expect(source).not.toContain("Authorization");
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  test("sends only a whitelisted operation and payload, never a token or URL", async () => {
    const sendMessage = installRuntime({ ok: true, data: { status: "none", match_method: null } });

    await expect(resolveMatch({
      platform: "whatsapp",
      raw_identifier: "+8613800001234",
    })).resolves.toEqual({ status: "none", match_method: null });

    const request = sendMessage.mock.calls[0][0];
    expect(request).toEqual({
      type: CONTENT_AGENT_REQUEST,
      operation: "resolve_match",
      payload: { platform: "whatsapp", raw_identifier: "+8613800001234" },
    });
    expect(JSON.stringify(request)).not.toContain("token");
    expect(JSON.stringify(request)).not.toContain("Authorization");
    expect(JSON.stringify(request)).not.toContain("http://");
  });

  test("parses successful data again at the message boundary", async () => {
    installRuntime({ ok: true, data: { items: [{ unexpected: true }], next_cursor: null } });
    await expect(searchCustomers("客户")).rejects.toMatchObject({
      code: API_ERROR_CODES.invalidResponse,
    });
  });

  test("normalizes safe background errors without a server message", async () => {
    installRuntime({
      ok: false,
      error: { code: API_ERROR_CODES.server, status: 500, request_id: "request-safe" },
    });
    try {
      await resolveMatch({ platform: "telegram", raw_identifier: "@buyer" });
      throw new Error("Expected proxy request to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        code: API_ERROR_CODES.server,
        status: 500,
        requestId: "request-safe",
        message: "Background request failed",
      });
    }
  });

  test("rejects an already-aborted request without messaging background", async () => {
    const sendMessage = installRuntime({ ok: true, data: { status: "none", match_method: null } });
    const controller = new AbortController();
    controller.abort();
    await expect(resolveMatch({
      platform: "telegram",
      raw_identifier: "@buyer",
    }, controller.signal)).rejects.toMatchObject({ code: API_ERROR_CODES.aborted });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("rejects an invalid paused reminder before messaging background", async () => {
    const sendMessage = installRuntime({ ok: true, data: undefined });
    await expect(createReminder({
      customer_id: "11111111-1111-4111-8111-111111111111",
      type: "paused",
      priority: "normal",
    })).rejects.toThrow("暂不跟进时必须填写原因");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("sends reminder status updates through the background whitelist", async () => {
    const sendMessage = installRuntime({
      ok: true,
      data: { ...reminder, status: "completed" },
    });

    await expect(updateContentReminderStatus(reminder.id, {
      status: "completed",
    })).resolves.toMatchObject({ id: reminder.id, status: "completed" });

    const request = sendMessage.mock.calls[0][0];
    expect(request).toEqual({
      type: CONTENT_AGENT_REQUEST,
      operation: "update_reminder_status",
      payload: {
        reminder_id: reminder.id,
        data: { status: "completed" },
      },
    });
    expect(JSON.stringify(request)).not.toContain("token");
    expect(JSON.stringify(request)).not.toContain("Authorization");
  });
});
