import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("enforces reminder and local data lifecycle semantics", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-lifecycle-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing unexpected temp path: ${temporaryRoot}`);
  }
  try {
    const child = Bun.spawn([
      process.execPath,
      "run",
      join(import.meta.dir, "helpers", "local-lifecycle-runner.ts"),
    ], {
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
    expect(result.paused).toMatchObject({
      no_date_due_at: "9999-12-31T23:59:59.999Z",
      no_date_popup: false,
      no_date_status: "pending",
      dated_popup: true,
      dated_status: "overdue",
      notifications: 1,
    });
    expect(result.backup).toEqual({
      first_import: "first_import",
      default_days: 7,
      overdue: "overdue",
      path_matches: true,
      size_nonzero: true,
    });
    expect(result.settings).toEqual({
      auto_start_applied: true,
      failure_rejected: true,
      failure_did_not_persist: true,
    });
    expect(result.clear).toMatchObject({
      rollback_rejected: true,
      rollback_preserved: true,
      invalid_status: 400,
      all_empty: true,
      settings_reset: {
        auto_start: 0,
        minimize_to_tray: 1,
        backup_reminder_days: 7,
        locale: "zh-CN",
        theme: "light",
      },
      database_file_preserved: true,
      external_backups_preserved: true,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 15_000);
