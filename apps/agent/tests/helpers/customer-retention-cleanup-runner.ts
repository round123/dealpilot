import { getRawDb } from "../../src/db/client";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { cleanupExpiredCustomers } from "../../src/services/cleanup-service";

runMigrations();
ensureSchema();

const raw = getRawDb();
const now = new Date("2026-07-31T12:00:00.000Z");
const createdAt = "2026-01-01T00:00:00.000Z";
const expiredCustomerId = "00000000-0000-4000-8000-000000000001";
const retainedCustomerId = "00000000-0000-4000-8000-000000000002";
const activeCustomerId = "00000000-0000-4000-8000-000000000003";
const expiredProjectId = "00000000-0000-4000-8000-000000000101";
const activeProjectId = "00000000-0000-4000-8000-000000000102";

function insertCustomer(id: string, name: string, deletedAt: string | null) {
  raw.query(`
    INSERT INTO customers
      (id, name, grade, status, deleted_at, created_at, updated_at)
    VALUES (?, ?, 'B', 'active', ?, ?, ?)
  `).run(id, name, deletedAt, createdAt, createdAt);
}

function countByCustomer(table: "customers" | "contacts", customerId: string) {
  const column = table === "customers" ? "id" : "customer_id";
  return (raw.query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`)
    .get(customerId) as { count: number }).count;
}

insertCustomer(
  expiredCustomerId,
  "Expired customer",
  "2026-07-01T12:00:00.000Z",
);
insertCustomer(
  retainedCustomerId,
  "Not expired customer",
  "2026-07-01T12:00:00.001Z",
);
insertCustomer(activeCustomerId, "Active customer", null);

raw.query(`
  INSERT INTO contacts (id, customer_id, name, created_at)
  VALUES (?, ?, ?, ?)
`).run(
  "00000000-0000-4000-8000-000000000201",
  expiredCustomerId,
  "Expired contact",
  createdAt,
);
raw.query(`
  INSERT INTO social_accounts
    (id, customer_id, platform, raw_identifier, normalized_identifier, manually_bound, created_at)
  VALUES (?, ?, 'wechat', 'expired-account', 'expired-account', 0, ?)
`).run(
  "00000000-0000-4000-8000-000000000301",
  expiredCustomerId,
  createdAt,
);
raw.query(`
  INSERT INTO projects
    (id, customer_id, name, currency, stage, grade, created_at, updated_at)
  VALUES (?, ?, 'Expired project', 'CNY', 'lead', 'A', ?, ?)
`).run(expiredProjectId, expiredCustomerId, createdAt, createdAt);
raw.query(`
  INSERT INTO follow_ups
    (id, customer_id, project_id, type, note, occurred_at, created_at)
  VALUES (?, ?, ?, 'note', 'Expired follow-up', ?, ?)
`).run(
  "00000000-0000-4000-8000-000000000401",
  expiredCustomerId,
  expiredProjectId,
  createdAt,
  createdAt,
);
raw.query(`
  INSERT INTO reminders
    (id, customer_id, project_id, type, status, due_at, priority, created_at, updated_at)
  VALUES (?, ?, ?, 'fixed_time', 'pending', ?, 'normal', ?, ?)
`).run(
  "00000000-0000-4000-8000-000000000501",
  expiredCustomerId,
  expiredProjectId,
  createdAt,
  createdAt,
  createdAt,
);
raw.query(`
  INSERT INTO risks
    (id, project_id, description, severity, status, created_at)
  VALUES (?, ?, 'Expired risk', 'medium', 'open', ?)
`).run(
  "00000000-0000-4000-8000-000000000601",
  expiredProjectId,
  createdAt,
);
raw.query(`
  INSERT INTO milestones (id, project_id, name, date, completed, created_at)
  VALUES (?, ?, 'Expired milestone', '2026-02-01', 0, ?)
`).run(
  "00000000-0000-4000-8000-000000000701",
  expiredProjectId,
  createdAt,
);

for (const [id, customerId, name] of [
  ["00000000-0000-4000-8000-000000000202", retainedCustomerId, "Retained contact"],
  ["00000000-0000-4000-8000-000000000203", activeCustomerId, "Active contact"],
]) {
  raw.query(`
    INSERT INTO contacts (id, customer_id, name, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, customerId, name, createdAt);
}

raw.query(`
  INSERT INTO social_accounts
    (id, customer_id, platform, raw_identifier, normalized_identifier, manually_bound, created_at)
  VALUES (?, ?, 'wechat', 'active-account', 'active-account', 0, ?)
`).run(
  "00000000-0000-4000-8000-000000000302",
  activeCustomerId,
  createdAt,
);
raw.query(`
  INSERT INTO projects
    (id, customer_id, name, currency, stage, grade, created_at, updated_at)
  VALUES (?, ?, 'Active project', 'CNY', 'lead', 'A', ?, ?)
`).run(activeProjectId, activeCustomerId, createdAt, createdAt);
raw.query(`
  INSERT INTO follow_ups
    (id, customer_id, project_id, type, note, occurred_at, created_at)
  VALUES (?, ?, ?, 'note', 'Active follow-up', ?, ?)
`).run(
  "00000000-0000-4000-8000-000000000402",
  activeCustomerId,
  activeProjectId,
  createdAt,
  createdAt,
);
raw.query(`
  INSERT INTO reminders
    (id, customer_id, project_id, type, status, due_at, priority, created_at, updated_at)
  VALUES (?, ?, ?, 'fixed_time', 'pending', ?, 'normal', ?, ?)
`).run(
  "00000000-0000-4000-8000-000000000502",
  activeCustomerId,
  activeProjectId,
  createdAt,
  createdAt,
  createdAt,
);
raw.query(`
  INSERT INTO risks
    (id, project_id, description, severity, status, created_at)
  VALUES (?, ?, 'Active risk', 'medium', 'open', ?)
`).run(
  "00000000-0000-4000-8000-000000000602",
  activeProjectId,
  createdAt,
);
raw.query(`
  INSERT INTO milestones (id, project_id, name, date, completed, created_at)
  VALUES (?, ?, 'Active milestone', '2026-02-01', 0, ?)
`).run(
  "00000000-0000-4000-8000-000000000702",
  activeProjectId,
  createdAt,
);

const deletedCount = await cleanupExpiredCustomers(now);

const expired = {
  customers: countByCustomer("customers", expiredCustomerId),
  contacts: countByCustomer("contacts", expiredCustomerId),
  social_accounts: (raw.query(
    "SELECT COUNT(*) AS count FROM social_accounts WHERE customer_id = ?",
  ).get(expiredCustomerId) as { count: number }).count,
  projects: (raw.query(
    "SELECT COUNT(*) AS count FROM projects WHERE customer_id = ?",
  ).get(expiredCustomerId) as { count: number }).count,
  follow_ups: (raw.query(
    "SELECT COUNT(*) AS count FROM follow_ups WHERE customer_id = ?",
  ).get(expiredCustomerId) as { count: number }).count,
  reminders: (raw.query(
    "SELECT COUNT(*) AS count FROM reminders WHERE customer_id = ?",
  ).get(expiredCustomerId) as { count: number }).count,
  risks: (raw.query(
    "SELECT COUNT(*) AS count FROM risks WHERE project_id = ?",
  ).get(expiredProjectId) as { count: number }).count,
  milestones: (raw.query(
    "SELECT COUNT(*) AS count FROM milestones WHERE project_id = ?",
  ).get(expiredProjectId) as { count: number }).count,
};

const foreignKeyViolations = raw.query("PRAGMA foreign_key_check").all().length;

console.log(JSON.stringify({
  deleted_count: deletedCount,
  expired,
  not_expired: {
    customers: countByCustomer("customers", retainedCustomerId),
    contacts: countByCustomer("contacts", retainedCustomerId),
  },
  active: {
    customers: countByCustomer("customers", activeCustomerId),
    contacts: countByCustomer("contacts", activeCustomerId),
    social_accounts: (raw.query(
      "SELECT COUNT(*) AS count FROM social_accounts WHERE customer_id = ?",
    ).get(activeCustomerId) as { count: number }).count,
    projects: (raw.query(
      "SELECT COUNT(*) AS count FROM projects WHERE customer_id = ?",
    ).get(activeCustomerId) as { count: number }).count,
    follow_ups: (raw.query(
      "SELECT COUNT(*) AS count FROM follow_ups WHERE customer_id = ?",
    ).get(activeCustomerId) as { count: number }).count,
    reminders: (raw.query(
      "SELECT COUNT(*) AS count FROM reminders WHERE customer_id = ?",
    ).get(activeCustomerId) as { count: number }).count,
    risks: (raw.query(
      "SELECT COUNT(*) AS count FROM risks WHERE project_id = ?",
    ).get(activeProjectId) as { count: number }).count,
    milestones: (raw.query(
      "SELECT COUNT(*) AS count FROM milestones WHERE project_id = ?",
    ).get(activeProjectId) as { count: number }).count,
  },
  foreign_key_violations: foreignKeyViolations,
}));

process.exit(0);
