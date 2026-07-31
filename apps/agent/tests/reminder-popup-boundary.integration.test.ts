import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("shows paused reminders only when their reevaluation time is due", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-popup-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const child = Bun.spawn([
      process.execPath,
      "run",
      join(import.meta.dir, "helpers", "reminder-popup-boundary-runner.ts"),
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
      future_visible: false,
      exactly_due_visible: true,
      no_reevaluation_visible: false,
      no_reevaluation: {
        id: expect.any(String),
        due_at: "9999-12-31T23:59:59.999Z",
        reevaluate_at: null,
        status: "pending",
      },
      exactly_due_status: "pending",
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 15_000);
