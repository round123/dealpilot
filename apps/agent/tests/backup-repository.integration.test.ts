import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("validates and atomically replaces backup databases", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-restore-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const child = Bun.spawn([
      process.execPath,
      "run",
      join(import.meta.dir, "helpers", "backup-repository-runner.ts"),
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

    expect(result).toEqual({
      no_current_success: { rows_restored: 2, marker_count: 1 },
      incompatible: { rejected: true, original_preserved: true },
      invalid_foreign_key: { rejected: true, original_preserved: true },
      no_current_failure: { rejected: true, database_not_created: true },
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 15_000);
