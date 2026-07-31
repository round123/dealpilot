import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("delivers and de-duplicates reminders against SQLite", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-reminders-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing unexpected temporary path: ${temporaryRoot}`);
  }

  try {
    const runner = join(import.meta.dir, "helpers", "reminder-delivery-runner.ts");
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
    const states = Object.fromEntries(result.states.map((item: any) => [item.id, item]));

    expect(result.first).toEqual({ due: 3, upcoming: 1, failed: 0 });
    expect(result.notificationsAfterFirst).toHaveLength(3);
    expect(result.second).toEqual({ due: 0, upcoming: 0, failed: 0 });
    expect(result.notificationsAfterSecond).toHaveLength(3);
    expect(states.due.status).toBe("overdue");
    expect(states["snoozed-due"].status).toBe("overdue");
    expect(states["snoozed-due"].delivered_at).toBe(
      "2026-07-29T10:00:00.000Z",
    );
    expect(states["snoozed-future"].status).toBe("snoozed");
    expect(states.upcoming.status).toBe("pending");
    expect(states.upcoming.last_notified_at).toBe("2026-07-29T10:00:00.000Z");
    expect(states.upcoming.delivered_at).toBe("2026-07-29T10:00:00.000Z");
    expect(states["pre-notified"].last_notified_at).toBe("2026-07-29T09:55:00.000Z");
    expect(states["waiting-reply"].status).toBe("pending");
    expect(result.completionLifecycle.first).toEqual(expect.any(String));
    expect(result.completionLifecycle.repeated).toBe(
      result.completionLifecycle.first,
    );
    expect(result.completionLifecycle.cleared).toBeNull();
    expect(result.completionLifecycle.handled).toEqual(expect.any(String));
    expect(states["completion-lifecycle"].completed_at).toBeNull();
    expect(states["completion-lifecycle"].handled_at).toEqual(expect.any(String));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 15_000);
