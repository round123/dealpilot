import { Database } from "bun:sqlite";
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const mode = process.argv[2];
if (mode !== "success" && mode !== "failure" && mode !== "checkpoint-failure") {
  throw new Error("Expected success, failure or checkpoint-failure mode");
}
const appDataDir = resolve(process.env.DEALPILOT_DATA_DIR!);
const dataDir = join(appDataDir, "data");
const databasePath = join(dataDir, "dealpilot.db");
const migrationsDir = join(appDataDir, "test-migrations");
const migrationMetaDir = join(migrationsDir, "meta");
const recoveryDir = join(dataDir, "recovery");
mkdirSync(dataDir, { recursive: true });
mkdirSync(migrationMetaDir, { recursive: true });
process.env.DEALPILOT_MIGRATIONS_DIR = migrationsDir;

if (mode === "checkpoint-failure") {
  const { closeDatabase, getRawDb, reopenDatabase } =
    await import("../../src/db/client");
  const raw = getRawDb();
  raw.exec("CREATE TABLE reopen_test (value TEXT NOT NULL);");
  raw.exec("INSERT INTO reopen_test (value) VALUES ('reopened');");
  raw.close();

  let closeFailed = false;
  try {
    closeDatabase();
  } catch {
    closeFailed = true;
  }

  reopenDatabase();
  const reopened = getRawDb();
  const reopenedValue = (
    reopened.query("SELECT value FROM reopen_test").get() as { value: string }
  ).value;
  const integrity = (
    reopened.query("PRAGMA integrity_check").get() as {
      integrity_check: string;
    }
  ).integrity_check;
  closeDatabase();
  console.log(
    JSON.stringify({
      close_failed: closeFailed,
      reopened_value: reopenedValue,
      integrity,
    }),
  );
  process.exit(0);
}

const oldDatabase = new Database(databasePath, { create: true });
oldDatabase.exec(`
  CREATE TABLE legacy_records (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO legacy_records (id, value) VALUES (1, 'preserved');
  CREATE TABLE __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    created_at numeric
  );
  INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('old', 1000);
`);
oldDatabase.close();

writeFileSync(
  join(migrationsDir, "0000_old.sql"),
  "CREATE TABLE legacy_records (id INTEGER PRIMARY KEY, value TEXT NOT NULL);",
);
writeFileSync(
  join(migrationsDir, "0001_upgrade.sql"),
  mode === "success"
    ? "ALTER TABLE legacy_records ADD COLUMN upgraded TEXT;--> statement-breakpoint\nUPDATE legacy_records SET upgraded = 'yes';"
    : "ALTER TABLE legacy_records ADD COLUMN upgraded TEXT;--> statement-breakpoint\nINSERT INTO missing_table (id) VALUES (1);",
);
writeFileSync(
  join(migrationMetaDir, "_journal.json"),
  JSON.stringify({
    version: "7",
    dialect: "sqlite",
    entries: [
      { idx: 0, version: "6", when: 1000, tag: "0000_old", breakpoints: true },
      {
        idx: 1,
        version: "6",
        when: 2000,
        tag: "0001_upgrade",
        breakpoints: true,
      },
    ],
  }),
);

if (mode === "success") {
  mkdirSync(recoveryDir, { recursive: true });
  copyFileSync(databasePath, join(recoveryDir, "migration-recovery-old.db"));
}

const { runMigrations } = await import("../../src/db/migrate");
const { closeDatabase, getRawDb } = await import("../../src/db/client");
let firstResult: ReturnType<typeof runMigrations> | undefined;
let migrationFailed = false;
try {
  firstResult = runMigrations();
} catch {
  migrationFailed = true;
}

const raw = getRawDb();
const valueAfter = (
  raw.query("SELECT value FROM legacy_records WHERE id = 1").get() as {
    value: string;
  }
).value;
const upgradedColumnExists = (
  raw.query("PRAGMA table_info(legacy_records)").all() as Array<{
    name: string;
  }>
).some(({ name }) => name === "upgraded");
const upgradedValue = upgradedColumnExists
  ? (
      raw.query("SELECT upgraded FROM legacy_records WHERE id = 1").get() as {
        upgraded: string | null;
      }
    ).upgraded
  : null;
const integrity = (
  raw.query("PRAGMA integrity_check").get() as { integrity_check: string }
).integrity_check;
const recoveryFilesAfterFirst = readdirSync(recoveryDir).filter((file) =>
  file.endsWith(".db"),
);

let secondResult: ReturnType<typeof runMigrations> | undefined;
let recoveryFilesAfterSecond = recoveryFilesAfterFirst;
if (mode === "success") {
  secondResult = runMigrations();
  recoveryFilesAfterSecond = readdirSync(recoveryDir).filter((file) =>
    file.endsWith(".db"),
  );
}
const temporaryFiles = readdirSync(dataDir).filter(
  (file) =>
    file.startsWith("migration-restore-") ||
    file.startsWith("migration-failed-"),
);
const recoverySizeBytes = recoveryFilesAfterSecond.reduce(
  (total, file) => total + statSync(join(recoveryDir, file)).size,
  0,
);
closeDatabase();

console.log(
  JSON.stringify({
    first_migrated: firstResult?.migrated,
    second_migrated: secondResult?.migrated,
    migration_failed: migrationFailed,
    value_after: valueAfter,
    upgraded_column_exists: upgradedColumnExists,
    upgraded_value: upgradedValue,
    recovery_count_after_first: recoveryFilesAfterFirst.length,
    recovery_count_after_second: recoveryFilesAfterSecond.length,
    recovery_count: recoveryFilesAfterFirst.length,
    recovery_unchanged_without_pending:
      recoveryFilesAfterFirst.join("|") === recoveryFilesAfterSecond.join("|"),
    recovery_size_bytes: recoverySizeBytes,
    integrity,
    temporary_files: temporaryFiles,
  }),
);
process.exit(0);
