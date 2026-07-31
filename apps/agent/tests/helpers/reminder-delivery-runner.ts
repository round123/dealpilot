import { getRawDb } from "../../src/db/client";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import {
  runReminderDeliverySweep,
  updateReminderStatus,
} from "../../src/services/reminder-service";

runMigrations();
ensureSchema();
const raw = getRawDb();
const now = new Date("2026-07-29T10:00:00.000Z");
const customerId = crypto.randomUUID();
const nowIso = now.toISOString();

raw.query(`
  INSERT INTO customers (id, name, grade, status, created_at, updated_at)
  VALUES (?, 'ACME', 'A', 'active', ?, ?)
`).run(customerId, nowIso, nowIso);

function insertReminder(
  id: string,
  status: string,
  dueAt: string,
  lastNotifiedAt: string | null = null,
  snoozeUntil: string | null = null,
  type = "fixed_time",
) {
  raw.query(`
    INSERT INTO reminders (
      id, customer_id, type, status, due_at, priority,
      last_notified_at, snooze_until, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'normal', ?, ?, ?, ?)
  `).run(
    id,
    customerId,
    type,
    status,
    dueAt,
    lastNotifiedAt,
    snoozeUntil,
    nowIso,
    nowIso,
  );
}

insertReminder("due", "pending", "2026-07-29T09:55:00.000Z");
insertReminder("upcoming", "pending", "2026-07-29T10:04:00.000Z");
insertReminder("pre-notified", "pending", "2026-07-29T09:59:00.000Z", "2026-07-29T09:55:00.000Z");
insertReminder("snoozed-due", "snoozed", "2026-07-29T09:00:00.000Z", null, "2026-07-29T09:59:00.000Z");
insertReminder("snoozed-future", "snoozed", "2026-07-29T09:00:00.000Z", null, "2026-07-29T10:10:00.000Z");
insertReminder("waiting-reply", "pending", "2026-07-30T10:00:00.000Z", null, null, "waiting_reply");
insertReminder("completion-lifecycle", "pending", "2026-07-30T11:00:00.000Z");

const notifications: string[] = [];
const first = await runReminderDeliverySweep(
  async ({ message }) => { notifications.push(message); },
  now,
);
const notificationsAfterFirst = [...notifications];
const second = await runReminderDeliverySweep(
  async ({ message }) => { notifications.push(message); },
  now,
);
await updateReminderStatus("waiting-reply", { status: "replied" });
const firstCompletion = await updateReminderStatus("completion-lifecycle", {
  status: "completed",
});
const repeatedCompletion = await updateReminderStatus("completion-lifecycle", {
  status: "completed",
});
const clearedCompletion = await updateReminderStatus("completion-lifecycle", {
  status: "ignored",
});

const states = raw.query(`
  SELECT id, status, last_notified_at, delivered_at, handled_at,
    completed_at, snooze_until
  FROM reminders
  ORDER BY id
`).all();

console.log(JSON.stringify({
  first,
  second,
  notificationsAfterFirst,
  notificationsAfterSecond: notifications,
  completionLifecycle: {
    first: firstCompletion.completed_at,
    repeated: repeatedCompletion.completed_at,
    cleared: clearedCompletion.completed_at,
    handled: clearedCompletion.handled_at,
  },
  states,
}));
