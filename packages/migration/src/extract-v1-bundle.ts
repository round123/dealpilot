import {
  MIGRATED_COLLECTIONS,
  MigrationExtractionError,
  type JsonRecord,
  type JsonValue,
  type MigratedCollection,
  type MigrationArtifact,
  type MigrationBundle,
  type MigrationIssue,
  type MigrationRecord,
  type SourcePreflight,
  type TableSummary,
  type V1ReadOnlySnapshot,
  type V1SnapshotProvider,
  V1_TABLES,
  type V1TableName,
} from "./domain.js";
import { sha256, stableJson } from "./stable-json.js";

const REQUIRED_COLUMNS: Record<V1TableName, string[]> = {
  customers: [
    "id",
    "name",
    "grade",
    "status",
    "deleted_at",
    "created_at",
    "updated_at",
  ],
  contacts: ["id", "customer_id", "name", "created_at"],
  social_accounts: [
    "id",
    "customer_id",
    "contact_id",
    "platform",
    "raw_identifier",
    "normalized_identifier",
    "manually_bound",
    "created_at",
  ],
  projects: [
    "id",
    "customer_id",
    "name",
    "currency",
    "stage",
    "grade",
    "created_at",
    "updated_at",
  ],
  follow_ups: [
    "id",
    "customer_id",
    "project_id",
    "type",
    "occurred_at",
    "created_at",
  ],
  reminders: [
    "id",
    "customer_id",
    "project_id",
    "type",
    "status",
    "due_at",
    "priority",
    "created_at",
    "updated_at",
  ],
  risks: [
    "id",
    "project_id",
    "description",
    "severity",
    "status",
    "created_at",
  ],
  milestones: ["id", "project_id", "name", "date", "completed", "created_at"],
  import_jobs: ["id", "status", "created_at"],
  local_events: ["id", "event_type", "metadata", "occurred_at"],
  settings: ["id", "locale", "theme"],
};

const LOCAL_SETTING_FIELDS = [
  "auto_start",
  "backup_reminder_days",
  "last_backup_at",
  "minimize_to_tray",
] as const;

export interface ExtractMigrationOptions {
  signal?: AbortSignal;
}

export function extractV1MigrationBundle(
  provider: V1SnapshotProvider,
  options: ExtractMigrationOptions = {},
): MigrationArtifact {
  const snapshot = provider.capture();
  let artifact: MigrationArtifact | undefined;
  let failure: unknown;

  try {
    artifact = extractSnapshot(snapshot, options.signal);
  } catch (error) {
    failure = error;
  }

  try {
    const current = snapshot.verifySourceUnchanged();
    if (
      current.aggregate_sha256 !== snapshot.source_fingerprint.aggregate_sha256
    ) {
      failure = new MigrationExtractionError(
        "The source SQLite files changed during extraction",
        [
          {
            severity: "error",
            code: "SOURCE_CHANGED",
            message:
              "The database or a SQLite sidecar changed after the read-only snapshot was captured",
          },
        ],
      );
    }
  } catch (error) {
    failure = error;
  } finally {
    snapshot.close();
  }

  if (failure) throw failure;
  return artifact!;
}

function extractSnapshot(
  snapshot: V1ReadOnlySnapshot,
  signal?: AbortSignal,
): MigrationArtifact {
  assertNotAborted(signal);
  const preflight = snapshot.preflight();
  const issues = validatePreflight(preflight);
  throwIfErrors("SQLite preflight failed", issues);

  const rows = {} as Record<V1TableName, JsonRecord[]>;
  const sourceTables = {} as Record<V1TableName, TableSummary>;
  for (const table of V1_TABLES) {
    assertNotAborted(signal);
    rows[table] = sortRows(snapshot.readTable(table));
    sourceTables[table] = summarize(rows[table], `source:${table}`);
  }

  const data = emptyCollections();
  mapRows(
    rows.customers,
    "customers",
    "companies",
    data.companies,
    issues,
    mapCustomer,
  );
  mapRows(
    rows.contacts,
    "contacts",
    "contacts",
    data.contacts,
    issues,
    mapContact,
  );
  mapRows(
    rows.social_accounts,
    "social_accounts",
    "social_accounts",
    data.social_accounts,
    issues,
    mapSocialAccount,
  );
  mapRows(rows.projects, "projects", "deals", data.deals, issues, mapProject);
  mapRows(
    rows.follow_ups,
    "follow_ups",
    "follow_ups",
    data.follow_ups,
    issues,
    mapFollowUp,
  );
  mapRows(
    rows.reminders,
    "reminders",
    "reminders",
    data.reminders,
    issues,
    mapReminder,
  );
  mapRows(rows.risks, "risks", "deal_risks", data.deal_risks, issues, mapRisk);
  mapRows(
    rows.milestones,
    "milestones",
    "deal_milestones",
    data.deal_milestones,
    issues,
    mapMilestone,
  );

  const ignoredEventCount = mapLocalEvents(rows.local_events, data, issues);
  const preferences = mapPreferences(
    rows.settings,
    snapshot.snapshot_sha256,
    issues,
  );
  throwIfErrors("V1 data contains records that cannot be migrated", issues);

  const collections = {} as Record<MigratedCollection, TableSummary>;
  for (const collection of MIGRATED_COLLECTIONS) {
    data[collection].sort((left, right) =>
      left.source_id.localeCompare(right.source_id),
    );
    collections[collection] = summarizeCollection(data[collection], collection);
  }

  const baseBundle = {
    format: "dealpilot-v1-sqlite-migration" as const,
    version: 1 as const,
    idempotency_key: `v1-sqlite:${snapshot.snapshot_sha256}`,
    source: {
      schema: "dealpilot-v1" as const,
      fingerprint: snapshot.source_fingerprint,
      snapshot_sha256: snapshot.snapshot_sha256,
    },
    preflight,
    source_tables: sourceTables,
    collections,
    exclusions: {
      import_jobs: {
        count: rows.import_jobs.length,
        reason: "historical_run_records" as const,
      },
      local_events: {
        count: ignoredEventCount,
        reason: "not_required_for_audit_or_restore" as const,
      },
      local_settings: {
        fields: [...LOCAL_SETTING_FIELDS],
        reason: "device_local_only" as const,
      },
    },
    user_preferences: preferences,
    data,
    issues: sortIssues(issues),
  };
  const bundleSha256 = sha256(stableJson(baseBundle));
  const bundle: MigrationBundle = {
    ...baseBundle,
    bundle_sha256: bundleSha256,
  };

  return {
    bundle,
    bundle_json: `${stableJson(bundle)}\n`,
    snapshot_bytes: snapshot.snapshot_bytes,
  };
}

function validatePreflight(preflight: SourcePreflight): MigrationIssue[] {
  const issues: MigrationIssue[] = [];
  if (preflight.integrity !== "ok") {
    issues.push({
      severity: "error",
      code: "SQLITE_INTEGRITY_FAILED",
      message:
        preflight.integrity_messages.join("; ") ||
        "SQLite integrity_check failed",
    });
  }
  if (preflight.foreign_key_violations > 0) {
    issues.push({
      severity: "error",
      code: "SQLITE_FOREIGN_KEY_VIOLATIONS",
      message: `SQLite reports ${preflight.foreign_key_violations} foreign key violation(s)`,
    });
  }
  for (const table of V1_TABLES) {
    const schema = preflight.tables[table];
    if (!schema) {
      issues.push({
        severity: "error",
        code: "MISSING_TABLE",
        message: `Required V1 table ${table} is missing`,
        table,
      });
      continue;
    }
    const columns = new Set(schema.columns);
    for (const column of REQUIRED_COLUMNS[table]) {
      if (!columns.has(column)) {
        issues.push({
          severity: "error",
          code: "MISSING_COLUMN",
          message: `Required column ${table}.${column} is missing`,
          table,
        });
      }
    }
  }
  return issues;
}

function mapRows(
  rows: JsonRecord[],
  table: V1TableName,
  collection: MigratedCollection,
  output: MigrationRecord[],
  issues: MigrationIssue[],
  mapper: (row: JsonRecord) => JsonRecord,
) {
  for (const row of rows) {
    const sourceId = rowId(row, table, issues);
    if (!sourceId) continue;
    try {
      output.push(migrationRecord(collection, sourceId, mapper(row)));
    } catch (error) {
      issues.push({
        severity: "error",
        code: "INVALID_ROW",
        message: error instanceof Error ? error.message : "Invalid V1 row",
        table,
        row_id: sourceId,
      });
    }
  }
}

function mapCustomer(row: JsonRecord): JsonRecord {
  return pick(row, [
    "id",
    "name",
    "company",
    "country",
    "source",
    "grade",
    "status",
    "deleted_at",
    "created_at",
    "updated_at",
  ]);
}

function mapContact(row: JsonRecord): JsonRecord {
  const email = nullableString(row.email);
  const phone = nullableString(row.phone);
  return {
    id: requiredString(row.id, "contacts.id"),
    company_id: requiredString(row.customer_id, "contacts.customer_id"),
    name: requiredString(row.name, "contacts.name"),
    title: nullableString(row.title),
    email_jsonb: email ? [{ email, type: "Work" }] : [],
    phone_jsonb: phone ? [{ number: phone, type: "Work" }] : [],
    created_at: requiredString(row.created_at, "contacts.created_at"),
  };
}

function mapSocialAccount(row: JsonRecord): JsonRecord {
  return {
    id: requiredString(row.id, "social_accounts.id"),
    company_id: requiredString(row.customer_id, "social_accounts.customer_id"),
    contact_id: nullableString(row.contact_id),
    platform: requiredString(row.platform, "social_accounts.platform"),
    raw_identifier: requiredString(
      row.raw_identifier,
      "social_accounts.raw_identifier",
    ),
    normalized_identifier: requiredString(
      row.normalized_identifier,
      "social_accounts.normalized_identifier",
    ),
    manually_bound: sqliteBoolean(row.manually_bound),
    created_at: requiredString(row.created_at, "social_accounts.created_at"),
  };
}

function mapProject(row: JsonRecord): JsonRecord {
  const target = rename(row, "customer_id", "company_id");
  target.expected_closing_date = nullableString(row.expected_close_date);
  delete target.expected_close_date;
  return target;
}

function mapFollowUp(row: JsonRecord): JsonRecord {
  return {
    ...rename(
      rename(row, "customer_id", "company_id"),
      "project_id",
      "deal_id",
    ),
  };
}

function mapReminder(row: JsonRecord): JsonRecord {
  const target = rename(
    rename(row, "customer_id", "company_id"),
    "project_id",
    "deal_id",
  );
  target.legacy_state = pick(row, [
    "completed_at",
    "delivered_at",
    "handled_at",
    "pause_reason",
    "reevaluate_at",
  ]);
  for (const field of [
    "completed_at",
    "delivered_at",
    "handled_at",
    "pause_reason",
    "reevaluate_at",
  ]) {
    delete target[field];
  }
  return target;
}

function mapRisk(row: JsonRecord): JsonRecord {
  return rename(row, "project_id", "deal_id");
}

function mapMilestone(row: JsonRecord): JsonRecord {
  const target = rename(row, "project_id", "deal_id");
  target.due_date = requiredString(row.date, "milestones.date");
  target.completed = sqliteBoolean(row.completed);
  delete target.date;
  return target;
}

function mapLocalEvents(
  rows: JsonRecord[],
  data: Record<MigratedCollection, MigrationRecord[]>,
  issues: MigrationIssue[],
): number {
  let ignored = 0;
  for (const row of rows) {
    const id = rowId(row, "local_events", issues);
    if (!id) continue;
    const eventType = nullableString(row.event_type);
    if (
      eventType !== "customer.soft_deleted" &&
      eventType !== "project.stage_changed"
    ) {
      ignored += 1;
      continue;
    }
    const metadata = parseMetadata(row.metadata, eventType, id, issues);
    if (metadata === undefined) continue;
    const collection =
      eventType === "customer.soft_deleted"
        ? "deletion_snapshots"
        : "audit_events";
    data[collection].push(
      migrationRecord(collection, id, {
        id,
        event_type: eventType,
        entity_type: nullableString(row.entity_type),
        entity_id: nullableString(row.entity_id),
        metadata,
        occurred_at: requiredString(
          row.occurred_at,
          "local_events.occurred_at",
        ),
      }),
    );
  }
  return ignored;
}

function parseMetadata(
  value: JsonValue | undefined,
  eventType: string,
  rowIdValue: string,
  issues: MigrationIssue[],
): JsonValue | undefined {
  if (value === null || value === undefined || value === "") return {};
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    issues.push({
      severity: eventType === "customer.soft_deleted" ? "error" : "warning",
      code: "INVALID_EVENT_METADATA",
      message: `Event ${eventType} has invalid JSON metadata`,
      table: "local_events",
      row_id: rowIdValue,
    });
    return eventType === "customer.soft_deleted"
      ? undefined
      : { legacy_raw: value };
  }
}

function mapPreferences(
  rows: JsonRecord[],
  snapshotSha256: string,
  issues: MigrationIssue[],
) {
  const row = rows.find((candidate) => candidate.id === 1) ?? rows[0];
  if (!row) {
    issues.push({
      severity: "warning",
      code: "MISSING_SETTINGS_ROW",
      message: "No settings row exists; cloud preferences use V1 defaults",
      table: "settings",
    });
  }
  return {
    idempotency_key: `v1:user_preferences:${snapshotSha256}`,
    locale: nullableString(row?.locale) ?? "zh-CN",
    theme: nullableString(row?.theme) ?? "light",
  };
}

function emptyCollections(): Record<MigratedCollection, MigrationRecord[]> {
  return Object.fromEntries(
    MIGRATED_COLLECTIONS.map((collection) => [collection, []]),
  ) as unknown as Record<MigratedCollection, MigrationRecord[]>;
}

function summarize(value: unknown[], namespace: string): TableSummary {
  const checksum = sha256(stableJson(value));
  return {
    count: value.length,
    first_id: itemId(value[0]),
    last_id: itemId(value.at(-1)),
    checksum_sha256: checksum,
    idempotency_key: `v1:${namespace}:${checksum}`,
  };
}

function summarizeCollection(
  records: MigrationRecord[],
  collection: MigratedCollection,
): TableSummary {
  const checksum = sha256(
    records.map((record) => record.checksum_sha256).join(""),
  );
  return {
    count: records.length,
    first_id: records[0]?.source_id ?? null,
    last_id: records.at(-1)?.source_id ?? null,
    checksum_sha256: checksum,
    idempotency_key: `v1:collection:${collection}:${checksum}`,
  };
}

function migrationRecord(
  collection: MigratedCollection,
  sourceId: string,
  data: JsonRecord,
): MigrationRecord {
  const payloadJson = stableJson(data);
  return {
    source_id: sourceId,
    target_id: sourceId,
    idempotency_key: `v1:${collection}:${sourceId}`,
    payload_json: payloadJson,
    checksum_sha256: sha256(payloadJson),
    data,
  };
}

function itemId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = record.source_id ?? record.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function sortRows(rows: JsonRecord[]): JsonRecord[] {
  return [...rows].sort((left, right) => {
    const leftId = String(left.id ?? stableJson(left));
    const rightId = String(right.id ?? stableJson(right));
    return leftId.localeCompare(rightId);
  });
}

function sortIssues(issues: MigrationIssue[]): MigrationIssue[] {
  return [...issues].sort((left, right) =>
    [left.severity, left.code, left.table ?? "", left.row_id ?? ""]
      .join(":")
      .localeCompare(
        [
          right.severity,
          right.code,
          right.table ?? "",
          right.row_id ?? "",
        ].join(":"),
      ),
  );
}

function throwIfErrors(message: string, issues: MigrationIssue[]) {
  const errors = issues.filter(({ severity }) => severity === "error");
  if (errors.length > 0)
    throw new MigrationExtractionError(message, sortIssues(issues));
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new MigrationExtractionError("Migration extraction was cancelled", [
      {
        severity: "error",
        code: "ABORTED",
        message: "Migration extraction was cancelled",
      },
    ]);
  }
}

function rowId(
  row: JsonRecord,
  table: V1TableName,
  issues: MigrationIssue[],
): string | undefined {
  const id = nullableString(row.id);
  if (id && isUuid(id)) return id;
  issues.push({
    severity: "error",
    code: "INVALID_SOURCE_ID",
    message: `${table}.id must be a UUID`,
    table,
    row_id: id ?? undefined,
  });
  return undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function requiredString(value: JsonValue | undefined, field: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new TypeError(`${field} must be a non-empty string`);
}

function nullableString(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function sqliteBoolean(value: JsonValue | undefined): boolean {
  return value === true || value === 1;
}

function pick(row: JsonRecord, fields: string[]): JsonRecord {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}

function rename(row: JsonRecord, source: string, target: string): JsonRecord {
  const result = { ...row, [target]: row[source] ?? null };
  delete result[source];
  return result;
}
