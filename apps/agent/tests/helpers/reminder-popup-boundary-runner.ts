import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { getRawDb } from "../../src/db/client";
import { createReminder, getPopupReminders } from "../../src/services/reminder-service";

runMigrations();
ensureSchema();

const now = new Date("2026-07-31T08:00:00.000Z");
const customerId = "00000000-0000-4000-8000-000000000001";
getRawDb().query(`
  INSERT INTO customers (id, name, grade, status, created_at, updated_at)
  VALUES (?, 'Popup boundary customer', 'A', 'active', ?, ?)
`).run(customerId, now.toISOString(), now.toISOString());

const future = await createReminder({
  customer_id: customerId,
  type: "paused",
  priority: "normal",
  pause_reason: "Future review",
  reevaluate_at: "2026-07-31T08:00:00.001Z",
});
const exactlyDue = await createReminder({
  customer_id: customerId,
  type: "paused",
  priority: "normal",
  pause_reason: "Review now",
  reevaluate_at: now.toISOString(),
});
const noReevaluation = await createReminder({
  customer_id: customerId,
  type: "paused",
  priority: "normal",
  pause_reason: "No review date",
});

const popupIds = (await getPopupReminders(now)).map(({ id }) => id);
const stored = getRawDb().query(`
  SELECT id, due_at, reevaluate_at, status
  FROM reminders
  WHERE id IN (?, ?, ?)
  ORDER BY id
`).all(future.id, exactlyDue.id, noReevaluation.id) as Array<{
  id: string;
  due_at: string;
  reevaluate_at: string | null;
  status: string;
}>;

console.log(JSON.stringify({
  future_visible: popupIds.includes(future.id),
  exactly_due_visible: popupIds.includes(exactlyDue.id),
  no_reevaluation_visible: popupIds.includes(noReevaluation.id),
  no_reevaluation: stored.find(({ id }) => id === noReevaluation.id),
  exactly_due_status: stored.find(({ id }) => id === exactlyDue.id)?.status,
}));

process.exit(0);
