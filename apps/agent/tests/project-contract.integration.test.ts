import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("persists complete project detail and archive semantics", async () => {
  const temporaryRoot = resolve(
    await mkdtemp(join(tmpdir(), "dealpilot-project-contract-")),
  );
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(
      import.meta.dir,
      "helpers",
      "project-contract-runner.ts",
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

    expect(result.project).toEqual({
      create_status: 201,
      created_reason: "Initial reason",
      update_status: 200,
      updated_reason: "Updated reason",
    });
    expect(result.detail.risk).toMatchObject({
      project_id: expect.any(String),
      status: "resolved",
      handled_at: "2026-07-29T08:00:00.000Z",
      created_at: expect.any(String),
    });
    expect(result.detail.milestone).toMatchObject({
      project_id: expect.any(String),
      completed: true,
      created_at: expect.any(String),
    });
    expect(result.archive).toEqual({
      status: 204,
      stage: "archived",
      reason: "Archived locally",
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);
