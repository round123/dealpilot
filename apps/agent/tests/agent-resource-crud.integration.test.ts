import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("supports deleted customers and complete risk/milestone CRUD", async () => {
  const temporaryRoot = resolve(
    await mkdtemp(join(tmpdir(), "dealpilot-agent-crud-")),
  );
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(
      import.meta.dir,
      "helpers",
      "agent-resource-crud-runner.ts",
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

    expect(result.validation).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
    expect(result.validation.fields.description).toBeArray();
    expect(result.validation.fields.severity).toBeArray();

    expect(result.risk.create_status).toBe(201);
    expect(result.risk.created).toMatchObject({
      description: "初始风险",
      status: "resolved",
      handled_at: "2026-07-30T08:00:00.000Z",
    });
    expect(result.risk.created.created_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(result.risk.updated).toMatchObject({
      description: "已更新风险",
      severity: "medium",
      status: "handling",
      handled_at: null,
    });
    expect(result.risk.delete_status).toBe(204);

    expect(result.milestone.create_status).toBe(201);
    expect(result.milestone.created).toMatchObject({
      name: "初始里程碑",
      date: "2026-08-15",
      completed: true,
    });
    expect(result.milestone.created.created_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(result.milestone.updated).toMatchObject({
      name: "已更新里程碑",
      date: "2026-08-20",
      completed: false,
    });
    expect(result.milestone.delete_status).toBe(204);
    expect(result.project_after_deletes).toEqual({ risks: [], milestones: [] });

    expect(result.deleted_customers.delete_status).toBe(204);
    expect(result.deleted_customers.listed_ids).toHaveLength(1);
    expect(result.deleted_customers.restore_status).toBe(200);
    expect(result.deleted_customers.listed_after_restore).toEqual([]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);
