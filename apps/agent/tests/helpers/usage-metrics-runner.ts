import { config } from "../../src/config/config";
import { getRawDb } from "../../src/db/client";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { createApp } from "../../src/server";
import {
  getAnonymizedUsageMetricsReport,
  getStats,
} from "../../src/services/stats-service";
import { updateReminderStatus } from "../../src/services/reminder-service";

runMigrations();
ensureSchema();

const raw = getRawDb();
const now = new Date("2026-07-31T12:00:00.000Z");
const customerA = crypto.randomUUID();
const customerB = crypto.randomUUID();
const observedIdentifier = "+8613800001234";
const privateCustomerName = "PRIVATE_CUSTOMER_SENTINEL";
const privateMessage = "PRIVATE_MESSAGE_SENTINEL";

raw.query(`
  INSERT INTO customers (id, name, grade, status, created_at, updated_at)
  VALUES (?, ?, 'A', 'active', ?, ?),
         (?, '指标客户 B', 'B', 'active', ?, ?)
`).run(customerA, privateCustomerName, now.toISOString(), now.toISOString(), customerB, now.toISOString(), now.toISOString());
raw.query(`
  INSERT INTO contacts (id, customer_id, name, phone, created_at)
  VALUES (?, ?, '联系人', ?, ?)
`).run(crypto.randomUUID(), customerA, observedIdentifier, now.toISOString());

function insertReminder(input: {
  id: string;
  status: string;
  dueAt: string;
  updatedAt: string;
  completedAt?: string;
  lastNotifiedAt?: string;
  deliveredAt?: string;
  handledAt?: string;
  snoozeUntil?: string;
}) {
  raw.query(`
    INSERT INTO reminders (
      id, customer_id, type, status, due_at, priority,
      last_notified_at, delivered_at, handled_at, completed_at,
      snooze_until, created_at, updated_at
    ) VALUES (?, ?, 'fixed_time', ?, ?, 'normal', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    customerA,
    input.status,
    input.dueAt,
    input.lastNotifiedAt ?? null,
    input.deliveredAt ?? null,
    input.handledAt ?? null,
    input.completedAt ?? null,
    input.snoozeUntil ?? null,
    input.dueAt,
    input.updatedAt,
  );
}

insertReminder({
  id: "on-time",
  status: "completed",
  dueAt: "2026-07-30T10:00:00.000Z",
  completedAt: "2026-07-31T09:59:59.000Z",
  updatedAt: "2026-07-31T11:00:00.000Z",
  lastNotifiedAt: "2026-07-30T10:00:00.000Z",
  deliveredAt: "2026-07-30T10:00:00.000Z",
  handledAt: "2026-07-31T09:59:59.000Z",
});
insertReminder({
  id: "late",
  status: "completed",
  dueAt: "2026-07-20T10:00:00.000Z",
  completedAt: "2026-07-21T10:00:01.000Z",
  updatedAt: "2026-07-21T10:00:01.000Z",
  lastNotifiedAt: "2026-07-20T10:00:00.000Z",
  deliveredAt: "2026-07-20T10:00:00.000Z",
  handledAt: "2026-07-21T10:00:01.000Z",
});
insertReminder({
  id: "unknown-completion-time",
  status: "completed",
  dueAt: "2026-07-25T10:00:00.000Z",
  updatedAt: "2026-07-25T11:00:00.000Z",
});
insertReminder({
  id: "handled-future",
  status: "overdue",
  dueAt: "2026-08-05T10:00:00.000Z",
  updatedAt: "2026-07-29T10:10:00.000Z",
  lastNotifiedAt: "2026-07-29T10:00:00.000Z",
  deliveredAt: "2026-07-29T10:00:00.000Z",
});
insertReminder({
  id: "unhandled",
  status: "overdue",
  dueAt: "2026-07-29T09:00:00.000Z",
  updatedAt: "2026-07-29T10:00:00.000Z",
  lastNotifiedAt: "2026-07-29T09:00:00.000Z",
  deliveredAt: "2026-07-29T09:00:00.000Z",
});
raw.query(`
  INSERT INTO follow_ups (
    id, customer_id, type, message_body, occurred_at, created_at
  ) VALUES (?, ?, 'message', ?, ?, ?)
`).run(
  crypto.randomUUID(),
  customerA,
  privateMessage,
  now.toISOString(),
  now.toISOString(),
);
insertReminder({
  id: "outside-window",
  status: "completed",
  dueAt: "2026-06-30T10:00:00.000Z",
  completedAt: "2026-06-30T11:00:00.000Z",
  updatedAt: "2026-06-30T11:00:00.000Z",
  lastNotifiedAt: "2026-06-30T10:00:00.000Z",
  deliveredAt: "2026-06-30T10:00:00.000Z",
  handledAt: "2026-06-30T11:00:00.000Z",
});

await updateReminderStatus("handled-future", {
  status: "snoozed",
  snooze_until: "2026-08-01T10:00:00.000Z",
});

const app = createApp();
const authorization = `Bearer ${config.token}`;
async function request(path: string, method = "GET", body?: unknown) {
  return app.request(`/api/v1/${path}`, {
    method,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...(method !== "GET" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

for (let index = 0; index < 2; index++) {
  const response = await request("matches/resolve", "POST", {
    platform: "whatsapp",
    raw_identifier: observedIdentifier,
  });
  if (response.status !== 200) throw new Error(await response.text());
}
const beforeCorrection = await getStats(now);

const sameTargetBindResponse = await request("matches/bind", "POST", {
  platform: "whatsapp",
  raw_identifier: observedIdentifier,
  customer_id: customerA,
});
if (sameTargetBindResponse.status !== 201) {
  throw new Error(await sameTargetBindResponse.text());
}
const afterSameTargetBind = await getStats(now);

const bindResponse = await request("matches/bind", "POST", {
  platform: "whatsapp",
  raw_identifier: observedIdentifier,
  customer_id: customerB,
});
if (bindResponse.status !== 201) throw new Error(await bindResponse.text());

const afterCorrection = await getStats(now);
const report = await getAnonymizedUsageMetricsReport(now);
const exportResponse = await request("stats/export");
const exportText = await exportResponse.text();
const events = raw.query(`
  SELECT event_type, entity_type, entity_id, metadata
  FROM local_events
  WHERE event_type LIKE 'match.%'
  ORDER BY event_type
`).all();
const snoozedReminder = raw.query(`
  SELECT last_notified_at, delivered_at, handled_at
  FROM reminders
  WHERE id = 'handled-future'
`).get();

console.log(JSON.stringify({
  beforeCorrection: beforeCorrection.rolling_30_days,
  afterSameTargetBind: afterSameTargetBind.rolling_30_days,
  afterCorrection: afterCorrection.rolling_30_days,
  report,
  exportStatus: exportResponse.status,
  exportContentType: exportResponse.headers.get("content-type"),
  exportDisposition: exportResponse.headers.get("content-disposition"),
  exportText,
  events,
  snoozedReminder,
  observedIdentifier,
  customerA,
  customerB,
  privateCustomerName,
  privateMessage,
}));
process.exit(0);
