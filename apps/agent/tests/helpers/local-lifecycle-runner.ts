import { existsSync } from "node:fs";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { config } from "../../src/config/config";
import { getRawDb } from "../../src/db/client";
import {
  createReminder,
  getPopupReminders,
  runReminderDeliverySweep,
} from "../../src/services/reminder-service";
import { clearLocalData, getLocalDataInfo } from "../../src/services/system-service";
import { updateSettings } from "../../src/services/settings-service";
import { createApp } from "../../src/server";
import { resetLocalDatabase } from "../../src/repositories/backup-repository";

runMigrations();
ensureSchema();

const raw = getRawDb();
const customerId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-31T04:00:00.000Z");
raw.query(`INSERT INTO customers
  (id, name, grade, status, created_at, updated_at)
  VALUES (?, '生命周期客户', 'A', 'active', ?, ?)`)
  .run(customerId, now.toISOString(), now.toISOString());
raw.query(`INSERT INTO import_jobs
  (id, file_name, total_rows, valid_rows, failed_rows, duplicate_count, status, created_at)
  VALUES (?, 'customers.csv', 1, 1, 0, 0, 'committed', ?)`)
  .run("00000000-0000-4000-8000-000000000002", now.toISOString());

const withoutDate = await createReminder({
  customer_id: customerId,
  type: "paused",
  priority: "normal",
  pause_reason: "暂无采购计划",
});
const withDate = await createReminder({
  customer_id: customerId,
  type: "paused",
  priority: "normal",
  pause_reason: "三天后重新确认",
  reevaluate_at: "2026-07-31T03:59:00.000Z",
});
const popupIds = (await getPopupReminders(now)).map(({ id }) => id);
const notifications: string[] = [];
const delivery = await runReminderDeliverySweep(async ({ message }) => {
  notifications.push(message);
}, now);
const noDateStatus = raw.query("SELECT status FROM reminders WHERE id = ?")
  .get(withoutDate.id) as { status: string };
const datedStatus = raw.query("SELECT status FROM reminders WHERE id = ?")
  .get(withDate.id) as { status: string };

const firstImportInfo = await getLocalDataInfo(now);
raw.query("UPDATE settings SET last_backup_at = ? WHERE id = 1")
  .run("2026-07-20T04:00:00.000Z");
const overdueInfo = await getLocalDataInfo(now);

let autoStartApplied = false;
await updateSettings({ auto_start: true }, (enabled) => {
  autoStartApplied = enabled;
});
let failedAutoStartRejected = false;
try {
  await updateSettings({ auto_start: false }, () => {
    throw new Error("registry unavailable");
  });
} catch {
  failedAutoStartRejected = true;
}
const persistedAutoStart = (raw.query("SELECT auto_start FROM settings WHERE id = 1").get() as { auto_start: number }).auto_start;

const beforeRollback = tableCounts(raw);
let rollbackRejected = false;
try {
  await resetLocalDatabase({
    beforeDeleteOldDatabase: () => {
      throw new Error("simulated old database deletion failure");
    },
  });
} catch {
  rollbackRejected = true;
}
const afterRollback = tableCounts(getRawDb());

const app = createApp();
const invalidClear = await app.request("/api/v1/system/local-data/clear", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({ confirmation: "CLEAR" }),
});
getRawDb().exec(`UPDATE settings SET auto_start = 0, minimize_to_tray = 0,
  backup_reminder_days = 30, locale = 'en', theme = 'dark' WHERE id = 1`);
const cleared = await clearLocalData({ confirmation: "CLEAR ALL DATA" });
const clearedDb = getRawDb();
const afterClear = tableCounts(clearedDb);
const clearedSettings = clearedDb.query(`SELECT auto_start, minimize_to_tray,
  backup_reminder_days, locale, theme FROM settings WHERE id = 1`).get();

console.log(JSON.stringify({
  paused: {
    no_date_due_at: withoutDate.due_at,
    no_date_popup: popupIds.includes(withoutDate.id),
    no_date_status: noDateStatus.status,
    dated_popup: popupIds.includes(withDate.id),
    dated_status: datedStatus.status,
    notifications: notifications.length,
    delivery,
  },
  backup: {
    first_import: firstImportInfo.backup_recommendation,
    default_days: firstImportInfo.backup_reminder_days,
    overdue: overdueInfo.backup_recommendation,
    path_matches: firstImportInfo.data_path === config.dbPath,
    size_nonzero: firstImportInfo.occupied_size_bytes > 0,
  },
  settings: {
    auto_start_applied: autoStartApplied,
    failure_rejected: failedAutoStartRejected,
    failure_did_not_persist: persistedAutoStart === 1,
  },
  clear: {
    rollback_rejected: rollbackRejected,
    rollback_preserved: JSON.stringify(beforeRollback) === JSON.stringify(afterRollback),
    invalid_status: invalidClear.status,
    deleted_records: cleared.deleted_records,
    all_empty: Object.values(afterClear).every((count) => count === 0),
    settings_reset: clearedSettings,
    database_file_preserved: existsSync(config.dbPath),
    external_backups_preserved: cleared.external_backups_preserved,
  },
}));

function tableCounts(database: ReturnType<typeof getRawDb>) {
  return Object.fromEntries([
    "customers", "reminders", "import_jobs", "local_events",
  ].map((table) => [
    table,
    (database.query(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count,
  ]));
}

process.exit(0);
