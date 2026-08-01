import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { API_ERROR_CODES, ApiError } from "../src/error.js";
import {
  createMigrationApi,
  V1_MIGRATION_COLLECTIONS,
  type V1MigrationBundle,
} from "../src/migration.js";

const jobId = "10000000-0000-4000-8000-000000000001";
const sourceId = "20000000-0000-4000-8000-000000000001";
const EMPTY_SHA = sha256("");

describe("V1 migration API", () => {
  it("validates, stages and reconciles a migration bundle", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "begin_v1_migration") {
        return {
          id: jobId,
          status: "running",
          source_fingerprint: "a".repeat(64),
          snapshot_checksum: "b".repeat(64),
          expected_counts: counts(1),
          expected_checksums: checksums(
            bundle().collections.companies.checksum_sha256,
          ),
        };
      }
      if (name === "stage_v1_migration_batch") {
        return {
          id: jobId,
          collection: "companies",
          inserted: 1,
          replayed: 0,
          staged_count: 1,
        };
      }
      return {
        id: jobId,
        status: "awaiting_confirmation",
        ready: true,
        actual_counts: counts(1),
        actual_checksums: checksums(
          bundle().collections.companies.checksum_sha256,
        ),
        differences: [],
      };
    });
    const progress = vi.fn();
    const migrations = createMigrationApi({ rpc: rpc as never });

    const result = await migrations.upload(bundle(), {
      batchSize: 1,
      onProgress: progress,
    });

    expect(result.reconciliation?.ready).toBe(true);
    expect(calls.map(({ name }) => name)).toEqual([
      "begin_v1_migration",
      "stage_v1_migration_batch",
      "reconcile_v1_migration",
    ]);
    expect(calls[1]?.args).toMatchObject({
      p_job_id: jobId,
      p_collection: "companies",
      p_records: [
        {
          source_id: sourceId,
          idempotency_key: `v1:companies:${sourceId}`,
        },
      ],
    });
    expect(progress).toHaveBeenCalledWith({
      collection: "companies",
      completed: 1,
      total: 1,
    });
  });

  it("rejects a tampered bundle before any network request", async () => {
    const rpc = vi.fn();
    const migrations = createMigrationApi({ rpc });
    const tampered = { ...bundle(), bundle_sha256: "f".repeat(64) };

    await expect(migrations.upload(tampered)).rejects.toBeInstanceOf(ApiError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not stage a migration that is already confirmed", async () => {
    const fixture = bundle();
    const rpc = vi.fn(async () => ({
      id: jobId,
      status: "confirmed",
      source_fingerprint: fixture.source.fingerprint.aggregate_sha256,
      snapshot_checksum: fixture.source.snapshot_sha256,
      expected_counts: counts(1),
      expected_checksums: checksums(
        fixture.collections.companies.checksum_sha256,
      ),
    }));
    const migrations = createMigrationApi({ rpc: rpc as never });

    const result = await migrations.upload(fixture);

    expect(result.reconciliation).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("reconciles an awaiting-confirmation retry without staging again", async () => {
    const fixture = bundle();
    const rpc = vi.fn(async (name: string) =>
      name === "begin_v1_migration"
        ? {
            id: jobId,
            status: "awaiting_confirmation",
            source_fingerprint: fixture.source.fingerprint.aggregate_sha256,
            snapshot_checksum: fixture.source.snapshot_sha256,
            expected_counts: counts(1),
            expected_checksums: checksums(
              fixture.collections.companies.checksum_sha256,
            ),
          }
        : {
            id: jobId,
            status: "awaiting_confirmation",
            ready: true,
            actual_counts: counts(1),
            actual_checksums: checksums(
              fixture.collections.companies.checksum_sha256,
            ),
            differences: [],
          },
    );
    const migrations = createMigrationApi({ rpc: rpc as never });

    await expect(migrations.upload(fixture)).resolves.toMatchObject({
      reconciliation: { ready: true },
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "begin_v1_migration",
      "reconcile_v1_migration",
    ]);
  });

  it("works when upload is called without its API object receiver", async () => {
    const fixture = bundle();
    const rpc = vi.fn(async (name: string) =>
      name === "begin_v1_migration"
        ? {
            id: jobId,
            status: "confirmed",
            source_fingerprint: fixture.source.fingerprint.aggregate_sha256,
            snapshot_checksum: fixture.source.snapshot_sha256,
            expected_counts: counts(1),
            expected_checksums: checksums(
              fixture.collections.companies.checksum_sha256,
            ),
          }
        : undefined,
    );
    const { upload } = createMigrationApi({ rpc: rpc as never });

    await expect(upload(fixture)).resolves.toMatchObject({
      job: { status: "confirmed" },
    });
  });

  it("normalizes invalid job IDs before making an RPC request", async () => {
    const rpc = vi.fn();
    const migrations = createMigrationApi({ rpc });

    for (const request of [
      migrations.reconcile("not-a-uuid"),
      migrations.confirm("not-a-uuid", bundle()),
      migrations.abandon("not-a-uuid"),
    ]) {
      await expect(request).rejects.toMatchObject({
        code: API_ERROR_CODES.validation,
        status: 400,
        fields: { jobId: expect.any(Array) },
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects terminal server states that cannot be reconciled", async () => {
    const fixture = bundle();
    const rpc = vi.fn(async () => ({
      id: jobId,
      status: "failed",
      source_fingerprint: fixture.source.fingerprint.aggregate_sha256,
      snapshot_checksum: fixture.source.snapshot_sha256,
      expected_counts: counts(1),
      expected_checksums: checksums(
        fixture.collections.companies.checksum_sha256,
      ),
    }));
    const migrations = createMigrationApi({ rpc: rpc as never });

    await expect(migrations.upload(fixture)).rejects.toMatchObject({
      code: API_ERROR_CODES.invalidResponse,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("confirms and abandons through their explicit transactional RPCs", async () => {
    const fixture = bundle();
    const rpc = vi.fn(async (name: string) =>
      name === "confirm_v1_migration"
        ? {
            id: jobId,
            status: "confirmed",
            confirmed_at: "2026-08-01T10:00:00.000Z",
            imported_counts: counts(1),
            staging_cleared: true,
          }
        : {
            id: jobId,
            status: "abandoned",
            staging_cleared: true,
          },
    );
    const migrations = createMigrationApi({ rpc: rpc as never });

    await expect(migrations.confirm(jobId, fixture)).resolves.toMatchObject({
      status: "confirmed",
    });
    await expect(migrations.abandon(jobId)).resolves.toMatchObject({
      status: "abandoned",
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "confirm_v1_migration",
      "abandon_v1_migration",
    ]);
  });
});

function bundle(): V1MigrationBundle {
  const payload = {
    id: sourceId,
    name: "迁移客户",
    company: null,
    country: "CN",
    source: "legacy",
    grade: "B",
    status: "potential",
    deleted_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const payloadJson = stableJson(payload);
  const recordChecksum = sha256(payloadJson);
  const companyChecksum = sha256(recordChecksum);
  const summaries = Object.fromEntries(
    V1_MIGRATION_COLLECTIONS.map((name) => [
      name,
      {
        count: name === "companies" ? 1 : 0,
        first_id: name === "companies" ? sourceId : null,
        last_id: name === "companies" ? sourceId : null,
        checksum_sha256: name === "companies" ? companyChecksum : EMPTY_SHA,
        idempotency_key: `v1:collection:${name}:${
          name === "companies" ? companyChecksum : EMPTY_SHA
        }`,
      },
    ]),
  ) as V1MigrationBundle["collections"];
  const data = Object.fromEntries(
    V1_MIGRATION_COLLECTIONS.map((name) => [
      name,
      name === "companies"
        ? [
            {
              source_id: sourceId,
              target_id: sourceId,
              idempotency_key: `v1:companies:${sourceId}`,
              payload_json: payloadJson,
              checksum_sha256: recordChecksum,
              data: payload,
            },
          ]
        : [],
    ]),
  ) as V1MigrationBundle["data"];
  const unsigned = {
    format: "dealpilot-v1-sqlite-migration" as const,
    version: 1 as const,
    idempotency_key: `v1-sqlite:${"b".repeat(64)}`,
    source: {
      schema: "dealpilot-v1" as const,
      fingerprint: {
        algorithm: "sha256" as const,
        aggregate_sha256: "a".repeat(64),
        files: [
          {
            role: "database" as const,
            present: true,
            size_bytes: 1024,
            mtime_ms: 1,
            sha256: "b".repeat(64),
          },
        ],
      },
      snapshot_sha256: "b".repeat(64),
    },
    preflight: {
      integrity: "ok" as const,
      integrity_messages: ["ok"],
      foreign_key_violations: 0,
      tables: {},
    },
    source_tables: {},
    collections: summaries,
    exclusions: {
      import_jobs: { count: 0, reason: "historical_run_records" as const },
      local_events: {
        count: 0,
        reason: "not_required_for_audit_or_restore" as const,
      },
      local_settings: {
        fields: ["auto_start"],
        reason: "device_local_only" as const,
      },
    },
    user_preferences: {
      idempotency_key: `v1:user_preferences:${"b".repeat(64)}`,
      locale: "zh-CN",
      theme: "light" as const,
    },
    data,
    issues: [],
  };
  return { ...unsigned, bundle_sha256: sha256(stableJson(unsigned)) };
}

const counts = (companyCount: number) =>
  Object.fromEntries(
    V1_MIGRATION_COLLECTIONS.map((name) => [
      name,
      name === "companies" ? companyCount : 0,
    ]),
  );

const checksums = (companyChecksum: string) =>
  Object.fromEntries(
    V1_MIGRATION_COLLECTIONS.map((name) => [
      name,
      name === "companies" ? companyChecksum : EMPTY_SHA,
    ]),
  );

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const stableJson = (value: unknown): string => JSON.stringify(sortJson(value));

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
};
