import { describe, expect, it, vi } from "vitest";
import {
  API_ERROR_CODES,
  ApiError,
  createReminderApi,
  ReminderIdSchema,
  ReminderStatusMutationInputSchema,
  type ApiClient,
} from "../src/index.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const REMINDER_ID = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-08-02T08:00:00.000Z";

const reminderRecord = {
  id: REMINDER_ID,
  owner_user_id: OWNER_ID,
  company_id: CUSTOMER_ID,
  deal_id: null,
  type: "waiting_reply",
  status: "completed",
  due_at: NOW,
  priority: "normal",
  last_notified_at: null,
  snooze_until: null,
  resolution: "completed",
  deletion_event_id: null,
  created_at: NOW,
  updated_at: NOW,
};

const createHarness = () => {
  const rpc = vi.fn();
  const api = createReminderApi({ rpc } as unknown as Pick<ApiClient, "rpc">);
  return { api, rpc };
};

describe("Reminder API facade", () => {
  it.each(["completed", "ignored", "replied"] as const)(
    "calls the idempotent RPC for %s",
    async (status) => {
      const { api, rpc } = createHarness();
      rpc.mockResolvedValue({ ...reminderRecord, status, resolution: null });

      await expect(
        api.updateStatus({
          reminderId: ReminderIdSchema.parse(REMINDER_ID),
          idempotencyKey: KEY,
          status,
        }),
      ).resolves.toMatchObject({ id: REMINDER_ID, status });

      expect(rpc).toHaveBeenCalledWith(
        "update_reminder_status_idempotent",
        {
          p_idempotency_key: KEY,
          p_reminder_id: REMINDER_ID,
          p_status: status,
          p_snooze_until: null,
          p_resolution: null,
        },
        expect.anything(),
        undefined,
      );
    },
  );

  it("requires a valid snooze timestamp and passes cancellation", async () => {
    const { api, rpc } = createHarness();
    const signal = new AbortController().signal;
    const snoozeUntil = "2026-08-03T08:00:00.000Z";
    rpc.mockResolvedValue({
      ...reminderRecord,
      status: "snoozed",
      snooze_until: snoozeUntil,
      resolution: null,
    });

    await api.updateStatus(
      {
        reminderId: ReminderIdSchema.parse(REMINDER_ID),
        idempotencyKey: KEY,
        status: "snoozed",
        snoozeUntil,
      },
      { signal },
    );

    expect(rpc.mock.calls[0]?.[3]).toEqual({ signal });
    expect(() =>
      ReminderStatusMutationInputSchema.parse({
        reminderId: REMINDER_ID,
        idempotencyKey: KEY,
        status: "snoozed",
      }),
    ).toThrow();
  });

  it("rejects non-UUID idempotency keys before the network boundary", async () => {
    const { api, rpc } = createHarness();
    await expect(
      api.updateStatus({
        reminderId: ReminderIdSchema.parse(REMINDER_ID),
        idempotencyKey: "retry-key",
        status: "completed",
      }),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps malformed successful responses and preserves normalized conflicts", async () => {
    const { api, rpc } = createHarness();
    rpc.mockResolvedValueOnce({ ...reminderRecord, status: "done" });
    await expect(
      api.updateStatus({
        reminderId: ReminderIdSchema.parse(REMINDER_ID),
        idempotencyKey: KEY,
        status: "completed",
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.invalidResponse });

    const conflict = new ApiError({
      code: API_ERROR_CODES.conflict,
      message: "Idempotency key conflict",
      status: 409,
    });
    rpc.mockRejectedValueOnce(conflict);
    await expect(
      api.updateStatus({
        reminderId: ReminderIdSchema.parse(REMINDER_ID),
        idempotencyKey: KEY,
        status: "ignored",
      }),
    ).rejects.toBe(conflict);
  });
});
