import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { API_ERROR_CODES, ApiError, type ApiClient } from "@dealpilot/api-client";

import {
  createFollowUp,
  fetchPopupReminders,
  resolveMatch,
  setExtensionApiClient,
  signInToCloud,
  updateReminderStatus,
} from "./api-client";

const session = {
  user: { id: "11111111-1111-4111-8111-111111111111", metadata: {} },
};
const customer = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "示例客户",
  company: null,
  country: null,
  source: null,
  grade: "B",
  status: "active",
  deleted_at: null,
  created_at: "2026-08-01T08:00:00.000Z",
  updated_at: "2026-08-01T08:00:00.000Z",
};

function clientWith(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    auth: {
      getSession: mock(async () => session),
      signInWithPassword: mock(async () => session),
    },
    list: mock(async () => ({ data: [], total: 0 })),
    ...overrides,
  } as unknown as ApiClient;
}

afterEach(() => {
  setExtensionApiClient(undefined);
  mock.restore();
});

describe("Cloud extension API boundary", () => {
  test("contains no independent fetch or local loopback transport", () => {
    const source = readFileSync(new URL("./api-client.ts", import.meta.url), "utf8");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("127.0.0.1");
    expect(source).not.toContain("connectNative");
    expect(source).toContain("createApiClient");
  });

  test("uses the shared Supabase auth API", async () => {
    const signIn = mock(async () => session);
    setExtensionApiClient(
      clientWith({ auth: { getSession: mock(async () => null), signInWithPassword: signIn } as never }),
    );
    await expect(signInToCloud("buyer@example.com", "secret")).resolves.toEqual(session);
    expect(signIn).toHaveBeenCalledWith("buyer@example.com", "secret");
  });

  test("rejects business access without a Cloud session", async () => {
    setExtensionApiClient(
      clientWith({ auth: { getSession: mock(async () => null) } as never }),
    );
    const error = await captureError(() =>
      resolveMatch({ platform: "telegram", raw_identifier: "@buyer" }),
    );
    expect(error.code).toBe(API_ERROR_CODES.unauthorized);
    expect(error.status).toBe(401);
  });

  test("creates follow-ups through the idempotent RPC and parses the response", async () => {
    const rpc = mock(async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      company_id: customer.id,
      deal_id: null,
      type: "message",
      note: null,
      message_body: "您好，请确认报价。",
      message_direction: "outbound",
      occurred_at: "2026-08-01T09:00:00.000Z",
      created_at: "2026-08-01T09:00:01.000Z",
      updated_at: "2026-08-01T09:00:01.000Z",
    }));
    setExtensionApiClient(clientWith({ rpc: rpc as never }));

    const idempotencyKey = "44444444-4444-4444-8444-444444444444";
    const result = await createFollowUp(
      {
        customer_id: customer.id,
        project_id: null,
        type: "message",
        note: null,
        message_body: "您好，请确认报价。",
        message_direction: "outbound",
        occurred_at: "2026-08-01T09:00:00.000Z",
      },
      idempotencyKey,
    );

    expect(rpc).toHaveBeenCalledWith(
      "create_follow_up_idempotent",
      {
        p_idempotency_key: idempotencyKey,
        p_company_id: customer.id,
        p_deal_id: null,
        p_type: "message",
        p_note: null,
        p_message_body: "您好，请确认报价。",
        p_message_direction: "outbound",
        p_occurred_at: "2026-08-01T09:00:00.000Z",
      },
      expect.anything(),
    );
    expect(result).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
      customer_id: customer.id,
      project_id: null,
      type: "message",
    });
    expect(result).not.toHaveProperty("company_id");
  });

  test("updates reminders only through the shared idempotent Reminder facade", async () => {
    const updateStatus = mock(async () => ({
      id: "33333333-3333-4333-8333-333333333333",
      owner_user_id: session.user.id,
      company_id: customer.id,
      deal_id: null,
      type: "waiting_reply" as const,
      status: "replied" as const,
      due_at: "2026-08-02T08:00:00.000Z",
      priority: "normal" as const,
      last_notified_at: null,
      snooze_until: null,
      resolution: "reply_received",
      deletion_event_id: null,
      created_at: "2026-08-01T08:00:00.000Z",
      updated_at: "2026-08-02T08:01:00.000Z",
    }));
    const directUpdate = mock(async () => ({}));
    setExtensionApiClient(
      clientWith({
        reminders: { updateStatus } as never,
        update: directUpdate as never,
      }),
    );

    await expect(
      updateReminderStatus(
        "33333333-3333-4333-8333-333333333333",
        { status: "replied" },
        "44444444-4444-4444-8444-444444444444",
      ),
    ).resolves.toMatchObject({ status: "replied", resolution: "reply_received" });

    expect(updateStatus).toHaveBeenCalledWith({
      reminderId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
      status: "replied",
      snoozeUntil: undefined,
      resolution: undefined,
    });
    expect(directUpdate).not.toHaveBeenCalled();
  });

  test("resolves a manually bound conversation through typed table queries", async () => {
    const list = mock(async (resource: string) => {
      if (resource === "social_accounts") {
        return {
          data: [{
            id: "33333333-3333-4333-8333-333333333333",
            company_id: customer.id,
            contact_id: null,
            platform: "telegram",
            raw_identifier: "@buyer",
            normalized_identifier: "buyer",
            manually_bound: true,
            created_at: "2026-08-01T08:00:00.000Z",
          }],
          total: 1,
        };
      }
      return { data: [customer], total: 1 };
    });
    setExtensionApiClient(clientWith({ list: list as never }));

    await expect(
      resolveMatch({ platform: "telegram", raw_identifier: "https://t.me/buyer" }),
    ).resolves.toEqual({ status: "unique", match_method: "manual", customer });
  });

  test("builds popup display data without leaking raw wire rows", async () => {
    const reminder = {
      id: "44444444-4444-4444-8444-444444444444",
      company_id: customer.id,
      deal_id: null,
      type: "waiting_reply",
      status: "pending",
      due_at: "2026-08-02T08:00:00.000Z",
      priority: "normal",
      last_notified_at: null,
      snooze_until: null,
      resolution: null,
      created_at: "2026-08-01T08:00:00.000Z",
      updated_at: "2026-08-01T08:00:00.000Z",
    };
    const list = mock(async (resource: string) => {
      if (resource === "reminders") return { data: [reminder], total: 1 };
      if (resource === "companies") return { data: [customer], total: 1 };
      return { data: [], total: 0 };
    });
    setExtensionApiClient(clientWith({ list: list as never }));

    const result = await fetchPopupReminders();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      customer_id: customer.id,
      customer_name: "示例客户",
      conversation_target: null,
    });
    expect(result[0]).not.toHaveProperty("company_id");
  });
});

async function captureError(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("Expected request to fail");
}
