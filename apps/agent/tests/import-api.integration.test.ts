import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("parses and commits the Phase 4 Excel fixture through the API", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-import-")));
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
      commit_status: 200,
      success: 4,
      failed: 2,
      skipped: 0,
      duplicates: 0,
      persisted_customers: 4,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 15_000);
