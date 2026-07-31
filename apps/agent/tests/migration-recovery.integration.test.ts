import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

for (const mode of ["success", "failure", "checkpoint-failure"] as const) {
  test(`migration recovery ${mode}`, async () => {
    const temporaryRoot = resolve(
      await mkdtemp(join(tmpdir(), `dealpilot-migration-${mode}-`)),
    );
    if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
      throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
    }

    try {
      const runner = join(
        import.meta.dir,
        "helpers",
        "migration-recovery-runner.ts",
      );
      const child = Bun.spawn([process.execPath, "run", runner, mode], {
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

      if (mode === "success") {
        expect(result).toMatchObject({
          first_migrated: true,
          second_migrated: false,
          value_after: "preserved",
          upgraded_value: "yes",
          recovery_count_after_first: 1,
          recovery_count_after_second: 1,
          recovery_unchanged_without_pending: true,
          integrity: "ok",
          temporary_files: [],
        });
        expect(result.recovery_size_bytes).toBeGreaterThan(0);
      } else if (mode === "failure") {
        expect(result).toMatchObject({
          migration_failed: true,
          value_after: "preserved",
          upgraded_column_exists: false,
          recovery_count: 1,
          integrity: "ok",
          temporary_files: [],
        });
      } else {
        expect(result).toMatchObject({
          close_failed: true,
          reopened_value: "reopened",
          integrity: "ok",
        });
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
}
