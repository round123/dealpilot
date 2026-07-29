import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("restores soft-deleted relations and validates encrypted backups", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-domain-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(import.meta.dir, "helpers", "domain-backup-runner.ts");
    const child = Bun.spawn([process.execPath, "run", runner], {
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

    expect(result.after_delete).toEqual({
      customer_deleted: true,
      open_status: "ignored",
      completed_status: "completed",
      social_bindings: 1,
    });
    expect(result.after_restore).toEqual({
      customer_deleted: false,
      open_status: "pending",
      open_resolution: "original note",
      social_bindings: 1,
    });
    expect(result.backup).toEqual({
      magic: "DPBK",
      version: 2,
      valid: { valid: true, schema_version: 2, app_version: "0.1.0", integrity_ok: true },
      wrong_password: { valid: false, integrity_ok: false },
      corrupted: { valid: false, integrity_ok: false },
      wrong_restore_rejected: true,
      failed_restore_preserved_rows: true,
      concurrent_write_status: 409,
      successful_restore_customer_rows: 1,
      restored: { success: true, rows_restored: 6 },
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);
