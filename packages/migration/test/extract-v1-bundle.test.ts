import { describe, expect, test } from "bun:test";

import {
  MIGRATED_COLLECTIONS,
  MigrationExtractionError,
  V1_TABLES,
  extractV1MigrationBundle,
  sha256,
  type JsonRecord,
  type SourcePreflight,
  type V1ReadOnlySnapshot,
  type V1SnapshotProvider,
  type V1TableName,
  verifyMigrationBundle,
} from "../src/index.js";

const ids = {
  customer: "11111111-1111-4111-8111-111111111111",
  contact: "22222222-2222-4222-8222-222222222222",
  social: "33333333-3333-4333-8333-333333333333",
  project: "44444444-4444-4444-8444-444444444444",
  followUp: "55555555-5555-4555-8555-555555555555",
  reminder: "66666666-6666-4666-8666-666666666666",
  risk: "77777777-7777-4777-8777-777777777777",
  milestone: "88888888-8888-4888-8888-888888888888",
  importJob: "99999999-9999-4999-8999-999999999999",
  deletionEvent: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  auditEvent: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  metricEvent: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
} as const;

const SNAPSHOT_BYTES = new Uint8Array([1]);
const SNAPSHOT_SHA256 = sha256(SNAPSHOT_BYTES);

describe("V1 migration application service", () => {
  test("produces a stable classified bundle without framework or database dependencies", () => {
    const rows = fixtureRows();
    const first = extractV1MigrationBundle(fakeProvider(rows));
    const second = extractV1MigrationBundle(fakeProvider(rows));

    expect(first.bundle_json).toBe(second.bundle_json);
    expect(first.bundle.bundle_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.bundle.idempotency_key).toBe(`v1-sqlite:${SNAPSHOT_SHA256}`);
    expect(first.bundle.source_tables.import_jobs.count).toBe(1);
    expect(first.bundle.exclusions.import_jobs).toEqual({
      count: 1,
      reason: "historical_run_records",
    });
    expect(first.bundle.exclusions.local_events).toEqual({
      count: 1,
      reason: "not_required_for_audit_or_restore",
    });
    expect(first.bundle.exclusions.local_settings.fields).toEqual([
      "auto_start",
      "backup_reminder_days",
      "last_backup_at",
      "minimize_to_tray",
    ]);
    expect(first.bundle.user_preferences).toMatchObject({
      locale: "zh-CN",
      theme: "dark",
    });

    const expectedCounts = {
      companies: 1,
      contacts: 1,
      social_accounts: 1,
      deals: 1,
      follow_ups: 1,
      reminders: 1,
      deal_risks: 1,
      deal_milestones: 1,
      audit_events: 1,
      deletion_snapshots: 1,
    } as const;
    for (const collection of MIGRATED_COLLECTIONS) {
      expect(first.bundle.collections[collection].count).toBe(
        expectedCounts[collection],
      );
      expect(first.bundle.collections[collection].checksum_sha256).toMatch(
        /^[0-9a-f]{64}$/,
      );
    }

    expect(first.bundle.data.contacts[0].data).toMatchObject({
      company_id: ids.customer,
      email_jsonb: [{ email: "buyer@example.test", type: "Work" }],
      phone_jsonb: [{ number: "+8613800000000", type: "Work" }],
    });
    expect(first.bundle.data.deals[0].data).toMatchObject({
      id: ids.project,
      company_id: ids.customer,
      expected_closing_date: "2026-10-01",
    });
    expect(first.bundle.data.reminders[0].data).toMatchObject({
      company_id: ids.customer,
      deal_id: ids.project,
      legacy_state: {
        completed_at: null,
        delivered_at: "2026-08-01T00:00:00.000Z",
        handled_at: null,
        pause_reason: null,
        reevaluate_at: null,
      },
    });
    expect(first.bundle.data.deletion_snapshots[0].data.metadata).toEqual({
      reminders: [{ id: ids.reminder, status: "pending" }],
    });
    expect(verifyMigrationBundle(first.bundle, first.snapshot_bytes)).toEqual({
      valid: true,
      issues: [],
    });

    const tampered = structuredClone(first.bundle);
    tampered.data.companies[0].data.name = "Tampered";
    expect(verifyMigrationBundle(tampered).valid).toBe(false);
  });

  test("reports invalid restore metadata and still verifies the source", () => {
    const rows = fixtureRows();
    rows.local_events[0].metadata = "not-json";
    let verified = false;

    expect(() =>
      extractV1MigrationBundle(
        fakeProvider(rows, () => {
          verified = true;
        }),
      ),
    ).toThrow(MigrationExtractionError);
    expect(verified).toBe(true);
  });
});

function fixtureRows(): Record<V1TableName, JsonRecord[]> {
  const timestamp = "2026-08-01T00:00:00.000Z";
  return {
    customers: [
      {
        id: ids.customer,
        name: "Fixture Customer",
        company: "Fixture Ltd",
        country: "CN",
        source: "v1",
        grade: "A",
        status: "active",
        deleted_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    contacts: [
      {
        id: ids.contact,
        customer_id: ids.customer,
        name: "Buyer",
        title: "Manager",
        email: "buyer@example.test",
        phone: "+8613800000000",
        created_at: timestamp,
      },
    ],
    social_accounts: [
      {
        id: ids.social,
        customer_id: ids.customer,
        contact_id: ids.contact,
        platform: "whatsapp",
        raw_identifier: "+8613800000000",
        normalized_identifier: "+8613800000000",
        manually_bound: 1,
        created_at: timestamp,
      },
    ],
    projects: [
      {
        id: ids.project,
        customer_id: ids.customer,
        name: "Fixture Deal",
        currency: "USD",
        amount: 1000,
        probability: 50,
        expected_close_date: "2026-10-01",
        stage: "proposal",
        grade: "A",
        closed_reason: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    follow_ups: [
      {
        id: ids.followUp,
        customer_id: ids.customer,
        project_id: ids.project,
        type: "call",
        note: "Follow up",
        message_body: null,
        message_direction: null,
        occurred_at: timestamp,
        created_at: timestamp,
      },
    ],
    reminders: [
      {
        id: ids.reminder,
        customer_id: ids.customer,
        project_id: ids.project,
        type: "fixed_time",
        status: "pending",
        due_at: "2026-08-02T00:00:00.000Z",
        priority: "high",
        last_notified_at: timestamp,
        delivered_at: timestamp,
        handled_at: null,
        completed_at: null,
        snooze_until: null,
        resolution: null,
        pause_reason: null,
        reevaluate_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    risks: [
      {
        id: ids.risk,
        project_id: ids.project,
        description: "Fixture risk",
        severity: "high",
        status: "open",
        handled_at: null,
        created_at: timestamp,
      },
    ],
    milestones: [
      {
        id: ids.milestone,
        project_id: ids.project,
        name: "Fixture milestone",
        date: "2026-09-01",
        completed: 0,
        created_at: timestamp,
      },
    ],
    import_jobs: [
      { id: ids.importJob, status: "committed", created_at: timestamp },
    ],
    local_events: [
      {
        id: ids.deletionEvent,
        event_type: "customer.soft_deleted",
        entity_type: "customer",
        entity_id: ids.customer,
        metadata: JSON.stringify({
          reminders: [{ id: ids.reminder, status: "pending" }],
        }),
        occurred_at: timestamp,
      },
      {
        id: ids.auditEvent,
        event_type: "project.stage_changed",
        entity_type: "project",
        entity_id: ids.project,
        metadata: JSON.stringify({ from: "lead", to: "proposal" }),
        occurred_at: timestamp,
      },
      {
        id: ids.metricEvent,
        event_type: "match.auto_confirmed",
        entity_type: "conversation_hash",
        entity_id: "redacted-hash",
        metadata: null,
        occurred_at: timestamp,
      },
    ],
    settings: [
      {
        id: 1,
        last_backup_at: timestamp,
        auto_start: 1,
        minimize_to_tray: 1,
        backup_reminder_days: 7,
        locale: "zh-CN",
        theme: "dark",
      },
    ],
  };
}

function fakeProvider(
  rows: Record<V1TableName, JsonRecord[]>,
  onVerify: () => void = () => undefined,
): V1SnapshotProvider {
  return {
    capture() {
      const preflight: SourcePreflight = {
        integrity: "ok",
        integrity_messages: ["ok"],
        foreign_key_violations: 0,
        tables: Object.fromEntries(
          V1_TABLES.map((table) => [
            table,
            { columns: Array.from(new Set(rows[table].flatMap(Object.keys))) },
          ]),
        ),
      };
      const snapshot: V1ReadOnlySnapshot = {
        source_fingerprint: {
          algorithm: "sha256",
          aggregate_sha256: "a".repeat(64),
          files: [
            {
              role: "database",
              present: true,
              size_bytes: 1,
              mtime_ms: 1,
              sha256: "a".repeat(64),
            },
          ],
        },
        snapshot_sha256: SNAPSHOT_SHA256,
        snapshot_bytes: SNAPSHOT_BYTES,
        preflight: () => preflight,
        readTable: (table) => rows[table],
        verifySourceUnchanged: () => {
          onVerify();
          return snapshot.source_fingerprint;
        },
        close: () => undefined,
      };
      return snapshot;
    },
  };
}
