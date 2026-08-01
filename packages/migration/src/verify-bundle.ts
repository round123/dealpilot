import type {
  MigratedCollection,
  MigrationBundle,
  MigrationIssue,
} from "./domain.js";
import { MIGRATED_COLLECTIONS } from "./domain.js";
import { sha256, stableJson } from "./stable-json.js";

export interface BundleVerificationResult {
  valid: boolean;
  issues: MigrationIssue[];
}

export function verifyMigrationBundle(
  bundle: MigrationBundle,
  snapshotBytes?: Uint8Array,
): BundleVerificationResult {
  const issues: MigrationIssue[] = [];
  const { bundle_sha256: declaredBundleHash, ...unsignedBundle } = bundle;
  const actualBundleHash = sha256(stableJson(unsignedBundle));
  if (actualBundleHash !== declaredBundleHash) {
    issues.push({
      severity: "error",
      code: "BUNDLE_CHECKSUM_MISMATCH",
      message: "The migration bundle checksum does not match its contents",
    });
  }

  if (bundle.idempotency_key !== `v1-sqlite:${bundle.source.snapshot_sha256}`) {
    issues.push({
      severity: "error",
      code: "BUNDLE_IDEMPOTENCY_KEY_MISMATCH",
      message: "The bundle idempotency key is not derived from its snapshot",
    });
  }

  for (const collection of MIGRATED_COLLECTIONS) {
    verifyCollection(bundle, collection, issues);
  }

  if (
    snapshotBytes &&
    sha256(snapshotBytes) !== bundle.source.snapshot_sha256
  ) {
    issues.push({
      severity: "error",
      code: "SNAPSHOT_CHECKSUM_MISMATCH",
      message: "The supplied SQLite snapshot does not belong to this bundle",
    });
  }

  return { valid: issues.length === 0, issues };
}

function verifyCollection(
  bundle: MigrationBundle,
  collection: MigratedCollection,
  issues: MigrationIssue[],
) {
  const records = bundle.data[collection];
  const summary = bundle.collections[collection];
  if (summary.count !== records.length) {
    issues.push({
      severity: "error",
      code: "COLLECTION_COUNT_MISMATCH",
      message: `${collection} count does not match its records`,
    });
  }
  for (const record of records) {
    if (
      record.payload_json !== stableJson(record.data) ||
      record.checksum_sha256 !== sha256(record.payload_json)
    ) {
      issues.push({
        severity: "error",
        code: "RECORD_CHECKSUM_MISMATCH",
        message: `${collection} record ${record.source_id} checksum does not match its payload`,
      });
    }
  }
  const collectionChecksum = sha256(
    records.map((record) => record.checksum_sha256).join(""),
  );
  if (summary.checksum_sha256 !== collectionChecksum) {
    issues.push({
      severity: "error",
      code: "COLLECTION_CHECKSUM_MISMATCH",
      message: `${collection} checksum does not match its records`,
    });
  }
  if (
    summary.idempotency_key !==
    `v1:collection:${collection}:${summary.checksum_sha256}`
  ) {
    issues.push({
      severity: "error",
      code: "COLLECTION_IDEMPOTENCY_KEY_MISMATCH",
      message: `${collection} batch idempotency key does not match its checksum`,
    });
  }
  const keys = new Set(records.map(({ idempotency_key }) => idempotency_key));
  if (keys.size !== records.length) {
    issues.push({
      severity: "error",
      code: "DUPLICATE_RECORD_IDEMPOTENCY_KEY",
      message: `${collection} contains duplicate record idempotency keys`,
    });
  }
}
