import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { getRawDb } from "../../src/db/client";
import { restoreCustomer, softDeleteCustomer } from "../../src/services/customer-service";
import { createBackup, restoreBackup, validateBackup } from "../../src/services/backup-service";
import { config } from "../../src/config/config";
import { createApp } from "../../src/server";

runMigrations();
ensureSchema();

const raw = getRawDb();
const now = "2026-07-29T12:00:00.000Z";
const customerId = "00000000-0000-4000-8000-000000000001";

raw.query(`
  INSERT INTO customers (id, name, grade, status, created_at, updated_at)
  VALUES (?, ?, 'A', 'active', ?, ?)
`).run(customerId, "Recoverable customer", now, now);
raw.query(`
  INSERT INTO social_accounts
    (id, customer_id, platform, raw_identifier, normalized_identifier, manually_bound, created_at)
  VALUES (?, ?, 'whatsapp', '+8613800000001', '+8613800000001', 0, ?)
`).run("00000000-0000-4000-8000-000000000002", customerId, now);
raw.query(`
  INSERT INTO reminders
    (id, customer_id, type, status, due_at, priority, resolution, created_at, updated_at)
  VALUES (?, ?, 'fixed_time', 'pending', ?, 'normal', 'original note', ?, ?)
`).run("00000000-0000-4000-8000-000000000003", customerId, now, now, now);
raw.query(`
  INSERT INTO reminders
    (id, customer_id, type, status, due_at, priority, created_at, updated_at)
  VALUES (?, ?, 'fixed_time', 'completed', ?, 'normal', ?, ?)
`).run("00000000-0000-4000-8000-000000000004", customerId, now, now, now);

await softDeleteCustomer(customerId);
const afterDelete = {
  customer_deleted: Boolean((raw.query("SELECT deleted_at FROM customers WHERE id = ?").get(customerId) as { deleted_at: string | null }).deleted_at),
  open_status: (raw.query("SELECT status FROM reminders WHERE id = ?").get("00000000-0000-4000-8000-000000000003") as { status: string }).status,
  completed_status: (raw.query("SELECT status FROM reminders WHERE id = ?").get("00000000-0000-4000-8000-000000000004") as { status: string }).status,
  social_bindings: (raw.query("SELECT COUNT(*) AS count FROM social_accounts WHERE customer_id = ?").get(customerId) as { count: number }).count,
};

await restoreCustomer(customerId);
const restoredReminder = raw.query("SELECT status, resolution FROM reminders WHERE id = ?")
  .get("00000000-0000-4000-8000-000000000003") as { status: string; resolution: string | null };
const afterRestore = {
  customer_deleted: Boolean((raw.query("SELECT deleted_at FROM customers WHERE id = ?").get(customerId) as { deleted_at: string | null }).deleted_at),
  open_status: restoredReminder.status,
  open_resolution: restoredReminder.resolution,
  social_bindings: (raw.query("SELECT COUNT(*) AS count FROM social_accounts WHERE customer_id = ?").get(customerId) as { count: number }).count,
};

const password = "phase4-secure-password";
const backup = await createBackup(password);
const valid = await validateBackup(backup, password);
const wrongPassword = await validateBackup(backup, "incorrect-password");
const corrupted = Buffer.from(backup);
corrupted[corrupted.length - 1] ^= 0xff;
const corruptedResult = await validateBackup(corrupted, password);

raw.query(`
  INSERT INTO customers (id, name, grade, status, created_at, updated_at)
  VALUES (?, ?, 'B', 'active', ?, ?)
`).run("00000000-0000-4000-8000-000000000099", "Created after backup", now, now);

const countBeforeFailedRestore = (raw.query("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count;
let wrongRestoreRejected = false;
try {
  await restoreBackup(backup, "incorrect-password");
} catch {
  wrongRestoreRejected = true;
}
const countAfterFailedRestore = (raw.query("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count;
const restorePromise = restoreBackup(backup, password);
const concurrentWrite = await createApp().request("/api/v1/customers", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({ name: "Must be blocked", grade: "B", status: "active" }),
});
const restored = await restorePromise;
const countAfterSuccessfulRestore = (getRawDb().query("SELECT COUNT(*) AS count FROM customers").get() as { count: number }).count;

console.log(JSON.stringify({
  after_delete: afterDelete,
  after_restore: afterRestore,
  backup: {
    magic: backup.subarray(0, 4).toString("ascii"),
    version: backup.readUInt8(4),
    valid,
    wrong_password: wrongPassword,
    corrupted: corruptedResult,
    wrong_restore_rejected: wrongRestoreRejected,
    failed_restore_preserved_rows: countBeforeFailedRestore === countAfterFailedRestore,
    concurrent_write_status: concurrentWrite.status,
    successful_restore_customer_rows: countAfterSuccessfulRestore,
    restored,
  },
}));

process.exit(0);
