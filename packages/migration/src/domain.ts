export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonRecord = { [key: string]: JsonValue };

export const V1_TABLES = [
  "customers",
  "contacts",
  "social_accounts",
  "projects",
  "follow_ups",
  "reminders",
  "risks",
  "milestones",
  "import_jobs",
  "local_events",
  "settings",
] as const;

export type V1TableName = (typeof V1_TABLES)[number];

export const MIGRATED_COLLECTIONS = [
  "companies",
  "contacts",
  "social_accounts",
  "deals",
  "follow_ups",
  "reminders",
  "deal_risks",
  "deal_milestones",
  "audit_events",
  "deletion_snapshots",
] as const;

export type MigratedCollection = (typeof MIGRATED_COLLECTIONS)[number];

export interface SourceFileFingerprint {
  role: "database" | "wal" | "shm";
  present: boolean;
  size_bytes: number;
  mtime_ms: number;
  sha256: string | null;
}

export interface SourceFingerprint {
  algorithm: "sha256";
  aggregate_sha256: string;
  files: SourceFileFingerprint[];
}

export interface SourcePreflight {
  integrity: "ok" | "failed";
  integrity_messages: string[];
  foreign_key_violations: number;
  tables: Record<string, { columns: string[] }>;
}

export interface V1ReadOnlySnapshot {
  readonly source_fingerprint: SourceFingerprint;
  readonly snapshot_sha256: string;
  readonly snapshot_bytes: Uint8Array;
  preflight(): SourcePreflight;
  readTable(table: V1TableName): JsonRecord[];
  verifySourceUnchanged(): SourceFingerprint;
  close(): void;
}

export interface V1SnapshotProvider {
  capture(): V1ReadOnlySnapshot;
}

export interface MigrationIssue {
  severity: "warning" | "error";
  code: string;
  message: string;
  table?: V1TableName;
  row_id?: string;
}

export interface TableSummary {
  count: number;
  first_id: string | null;
  last_id: string | null;
  checksum_sha256: string;
  idempotency_key: string;
}

export interface MigrationRecord {
  source_id: string;
  target_id: string;
  idempotency_key: string;
  payload_json: string;
  checksum_sha256: string;
  data: JsonRecord;
}

export interface UserPreferencesMigration {
  idempotency_key: string;
  locale: string;
  theme: string;
}

export interface MigrationBundle {
  format: "dealpilot-v1-sqlite-migration";
  version: 1;
  idempotency_key: string;
  bundle_sha256: string;
  source: {
    schema: "dealpilot-v1";
    fingerprint: SourceFingerprint;
    snapshot_sha256: string;
  };
  preflight: SourcePreflight;
  source_tables: Record<V1TableName, TableSummary>;
  collections: Record<MigratedCollection, TableSummary>;
  exclusions: {
    import_jobs: { count: number; reason: "historical_run_records" };
    local_events: {
      count: number;
      reason: "not_required_for_audit_or_restore";
    };
    local_settings: {
      fields: string[];
      reason: "device_local_only";
    };
  };
  user_preferences: UserPreferencesMigration;
  data: Record<MigratedCollection, MigrationRecord[]>;
  issues: MigrationIssue[];
}

export interface MigrationArtifact {
  bundle: MigrationBundle;
  bundle_json: string;
  snapshot_bytes: Uint8Array;
}

export class MigrationExtractionError extends Error {
  constructor(
    message: string,
    readonly issues: MigrationIssue[],
  ) {
    super(message);
    this.name = "MigrationExtractionError";
  }
}
