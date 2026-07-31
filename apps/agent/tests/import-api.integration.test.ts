import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("parses and commits the Phase 4 Excel fixture through the API", async () => {
  const temporaryRoot = resolve(
    await mkdtemp(join(tmpdir(), "dealpilot-import-")),
  );
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(import.meta.dir, "helpers", "import-api-runner.ts");
    const fixture = join(import.meta.dir, "fixtures", "test_customers.xlsx");
    const child = Bun.spawn([process.execPath, "run", runner, fixture], {
      cwd: join(import.meta.dir, ".."),
      env: { ...Bun.env, DEALPILOT_DATA_DIR: temporaryRoot },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode, stderr).toBe(0);
    const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!);
    expect(result).toEqual({
      parse_status: 200,
      total_rows: 6,
      valid_rows: 4,
      errors: 2,
      duplicate_candidates: 0,
      preview_customers: 0,
      preview_jobs: 0,
      errors_before_commit_status: 200,
      failed_commit_status: 500,
      customers_after_rollback: 0,
      jobs_after_rollback: 0,
      commit_status: 200,
      replay_status: 200,
      replay_matches: true,
      jobs_after_replay: 1,
      success: 4,
      failed: 2,
      skipped: 0,
      duplicates: 0,
      persisted_customers: 4,
      persisted_timestamps_are_iso: true,
      errors_after_commit_status: 200,
      mapped_parse_status: 200,
      mapped_valid_rows: 1,
      mapped_errors: 1,
      mapped_source_columns: ["客户简称", "采购邮箱", "等级说明"],
      mapped_preview: {
        name: "自定义映射客户",
        email: "mapped@example.com",
        grade: "A",
      },
      customers_after_mapped_parse: 4,
      jobs_after_mapped_parse: 1,
      mapped_commit_status: 200,
      mapped_commit: {
        success: 1,
        failed: 1,
        skipped: 0,
        duplicates: 0,
      },
      missing_name_status: 400,
      missing_name_fields: ["mapping.name"],
      duplicate_mapping_status: 400,
      duplicate_mapping_fields: ["mapping.email"],
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 15_000);
