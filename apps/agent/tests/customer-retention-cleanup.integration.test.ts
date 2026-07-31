import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("permanently deletes customers only after the 30-day retention period", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-cleanup-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(
      import.meta.dir,
      "helpers",
      "customer-retention-cleanup-runner.ts",
    );
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

    expect(result.deleted_count).toBe(1);
    expect(result.expired).toEqual({
      customers: 0,
      contacts: 0,
      social_accounts: 0,
      projects: 0,
      follow_ups: 0,
      reminders: 0,
      risks: 0,
      milestones: 0,
    });
    expect(result.not_expired).toEqual({ customers: 1, contacts: 1 });
    expect(result.active).toEqual({
      customers: 1,
      contacts: 1,
      social_accounts: 1,
      projects: 1,
      follow_ups: 1,
      reminders: 1,
      risks: 1,
      milestones: 1,
    });
    expect(result.foreign_key_violations).toBe(0);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);
