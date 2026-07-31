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
const fixtureNow = new Date();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const atOffset = (offsetMs: number) =>
  new Date(fixtureNow.getTime() + offsetMs).toISOString();
const snoozedDeliveredAt = atOffset(-2 * DAY_MS);
const customerA = crypto.randomUUID();
const customerB = crypto.randomUUID();
const observedIdentifier = "+8613800001234";
const privateCustomerName = "PRIVATE_CUSTOMER_SENTINEL";
const privateMessage = "PRIVATE_MESSAGE_SENTINEL";

raw.query(`
  INSERT INTO customers (id, name, grade, status, created_at, updated_at)
  VALUES (?, ?, 'A', 'active', ?, ?),
         (?, '指标客户 B', 'B', 'active', ?, ?)
`).run(
  customerA,
  privateCustomerName,
  fixtureNow.toISOString(),
  fixtureNow.toISOString(),
  customerB,
  fixtureNow.toISOString(),
  fixtureNow.toISOString(),
);
raw.query(`
  INSERT INTO contacts (id, customer_id, name, phone, created_at)
  VALUES (?, ?, '联系人', ?, ?)
`).run(
  crypto.randomUUID(),
  customerA,
  observedIdentifier,
  fixtureNow.toISOString(),
);

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
  dueAt: atOffset(-36 * HOUR_MS),
  completedAt: atOffset(-12 * HOUR_MS - 1_000),
  updatedAt: atOffset(-11 * HOUR_MS),
  lastNotifiedAt: atOffset(-36 * HOUR_MS),
  deliveredAt: atOffset(-36 * HOUR_MS),
  handledAt: atOffset(-12 * HOUR_MS - 1_000),
});
insertReminder({
  id: "late",
  status: "completed",
  dueAt: atOffset(-12 * DAY_MS),
  completedAt: atOffset(-11 * DAY_MS + 1_000),
  updatedAt: atOffset(-11 * DAY_MS + 1_000),
  lastNotifiedAt: atOffset(-12 * DAY_MS),
  deliveredAt: atOffset(-12 * DAY_MS),
  handledAt: atOffset(-11 * DAY_MS + 1_000),
});
insertReminder({
  id: "unknown-completion-time",
  status: "completed",
  dueAt: atOffset(-6 * DAY_MS),
  updatedAt: atOffset(-6 * DAY_MS + HOUR_MS),
});
insertReminder({
  id: "handled-future",
  status: "overdue",
  dueAt: atOffset(5 * DAY_MS),
  updatedAt: atOffset(-2 * DAY_MS + 10 * 60 * 1000),
  lastNotifiedAt: snoozedDeliveredAt,
  deliveredAt: snoozedDeliveredAt,
});
insertReminder({
  id: "unhandled",
  status: "overdue",
  dueAt: atOffset(-2 * DAY_MS - HOUR_MS),
  updatedAt: atOffset(-2 * DAY_MS),
  lastNotifiedAt: atOffset(-2 * DAY_MS - HOUR_MS),
  deliveredAt: atOffset(-2 * DAY_MS - HOUR_MS),
});
raw.query(`
  INSERT INTO follow_ups (
    id, customer_id, type, message_body, occurred_at, created_at
  ) VALUES (?, ?, 'message', ?, ?, ?)
`).run(
  crypto.randomUUID(),
  customerA,
  privateMessage,
  fixtureNow.toISOString(),
  fixtureNow.toISOString(),
);
insertReminder({
  id: "outside-window",
  status: "completed",
  dueAt: atOffset(-30 * DAY_MS - 1),
  completedAt: atOffset(-30 * DAY_MS + HOUR_MS),
  updatedAt: atOffset(-30 * DAY_MS + HOUR_MS),
  lastNotifiedAt: atOffset(-30 * DAY_MS - 1),
  deliveredAt: atOffset(-30 * DAY_MS - 1),
  handledAt: atOffset(-30 * DAY_MS + HOUR_MS),
});

await updateReminderStatus("handled-future", {
  status: "snoozed",
  snooze_until: atOffset(DAY_MS),
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
const beforeCorrection = await getStats(new Date());

const sameTargetBindResponse = await request("matches/bind", "POST", {
  platform: "whatsapp",
  raw_identifier: observedIdentifier,
  customer_id: customerA,
});
if (sameTargetBindResponse.status !== 201) {
  throw new Error(await sameTargetBindResponse.text());
}
const afterSameTargetBind = await getStats(new Date());

const bindResponse = await request("matches/bind", "POST", {
  platform: "whatsapp",
  raw_identifier: observedIdentifier,
  customer_id: customerB,
});
if (bindResponse.status !== 201) throw new Error(await bindResponse.text());

const afterCorrection = await getStats(new Date());
const report = await getAnonymizedUsageMetricsReport(new Date());
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
  snoozedDeliveredAt,
  observedIdentifier,
  customerA,
  customerB,
  privateCustomerName,
  privateMessage,
}));
process.exit(0);
