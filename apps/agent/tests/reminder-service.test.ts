import { describe, expect, test } from "bun:test";
import {
  runReminderDeliverySweep,
  type ReminderDeliveryStore,
} from "../src/services/reminder-service";

function fakeStore(options?: { alreadyNotified?: boolean }): {
  store: ReminderDeliveryStore;
  overdue: Array<[string, string | null]>;
  notified: Array<[string, string]>;
} {
  const overdue: Array<[string, string | null]> = [];
  const notified: Array<[string, string]> = [];
  return {
    overdue,
    notified,
    store: {
      findDue: async () => [{
        reminder: {
          id: "due-1",
          last_notified_at: options?.alreadyNotified ? "2026-07-29T09:56:00.000Z" : null,
        },
        customerName: "Acme",
      }],
      findUpcoming: async () => [{
        reminder: { id: "upcoming-1", last_notified_at: null },
        customerName: "Beta",
      }],
      markOverdue: async (id, at) => { overdue.push([id, at]); },
      markNotified: async (id, at) => { notified.push([id, at]); },
    },
  };
}

describe("reminder delivery", () => {
  test("notifies due and upcoming reminders then persists delivery state", async () => {
    const fake = fakeStore();
    const notifications: string[] = [];
    const now = new Date("2026-07-29T10:00:00.000Z");
    const result = await runReminderDeliverySweep(
      async ({ message }) => { notifications.push(message); },
      now,
      fake.store,
    );

    expect(result).toEqual({ due: 1, upcoming: 1, failed: 0 });
    expect(notifications).toEqual(["Acme - 提醒已到期", "Beta - 提醒即将到期"]);
    expect(fake.overdue).toEqual([["due-1", now.toISOString()]]);
    expect(fake.notified).toEqual([["upcoming-1", now.toISOString()]]);
  });

  test("does not duplicate a due notification already sent in the five-minute window", async () => {
    const fake = fakeStore({ alreadyNotified: true });
    const notifications: string[] = [];
    await runReminderDeliverySweep(
      async ({ message }) => { notifications.push(message); },
      new Date("2026-07-29T10:00:00.000Z"),
      { ...fake.store, findUpcoming: async () => [] },
    );

    expect(notifications).toEqual([]);
    expect(fake.overdue).toEqual([["due-1", null]]);
  });

  test("leaves a due reminder retryable when system notification fails", async () => {
    const fake = fakeStore();
    const result = await runReminderDeliverySweep(
      async () => { throw new Error("notification unavailable"); },
      new Date("2026-07-29T10:00:00.000Z"),
      { ...fake.store, findUpcoming: async () => [] },
    );

    expect(result).toEqual({ due: 0, upcoming: 0, failed: 1 });
    expect(fake.overdue).toEqual([]);
  });

  test("uses an exact five-minute upcoming window", async () => {
    let dueAt = "";
    let windowStart = "";
    let windowEnd = "";
    const now = new Date("2026-07-29T10:00:00.000Z");
    const store: ReminderDeliveryStore = {
      findDue: async (value) => { dueAt = value; return []; },
      findUpcoming: async (start, end) => {
        windowStart = start;
        windowEnd = end;
        return [];
      },
      markOverdue: async () => {},
      markNotified: async () => {},
    };

    await runReminderDeliverySweep(async () => {}, now, store);

    expect(dueAt).toBe(now.toISOString());
    expect(windowStart).toBe(now.toISOString());
    expect(windowEnd).toBe("2026-07-29T10:05:00.000Z");
  });

  test("continues delivering later reminders after one state write fails", async () => {
    const notifications: string[] = [];
    const persisted: string[] = [];
    const store: ReminderDeliveryStore = {
      findDue: async () => [
        { reminder: { id: "broken", last_notified_at: null }, customerName: "Broken" },
        { reminder: { id: "healthy", last_notified_at: null }, customerName: "Healthy" },
      ],
      findUpcoming: async () => [],
      markOverdue: async (id) => {
        if (id === "broken") throw new Error("database busy");
        persisted.push(id);
      },
      markNotified: async () => {},
    };

    const result = await runReminderDeliverySweep(
      async ({ message }) => { notifications.push(message); },
      new Date("2026-07-29T10:00:00.000Z"),
      store,
    );

    expect(result).toEqual({ due: 1, upcoming: 0, failed: 1 });
    expect(notifications).toHaveLength(2);
    expect(persisted).toEqual(["healthy"]);
  });
});
