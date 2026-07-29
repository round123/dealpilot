import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("meets the automated Phase 4 EARS acceptance baseline", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-qa-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(import.meta.dir, "helpers", "phase4-qa-runner.ts");
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
    console.log(`[phase4-qa] ${JSON.stringify(result)}`);

    expect(result.import_1000.parse_status).toBe(200);
    expect(result.import_1000.commit_status).toBe(200);
    expect(result.import_1000.parsed_rows).toBe(1000);
    expect(result.import_1000.imported_rows).toBe(1000);
    expect(result.import_1000.duration_ms).toBeLessThan(30_000);
    expect(result.customer_search_p95_ms).toBeLessThan(1_000);
    expect(result.match.bind_status).toBe(201);
    expect(result.match.p95_ms).toBeLessThan(1_000);
    expect(result.duplicate).toEqual({ candidates: 1, unresolved_status: 400, resolved_status: 200, skipped: 1 });
    expect(result.merge).toEqual({
      status: 200,
      counts: { follow_ups: 1, projects: 1, reminders: 1, social_accounts: 1 },
    });
    expect(result.stage).toEqual({ status: 200, value: "qualified", events: 1 });
    expect(result.milestone_reminders_created).toBe(1);
    expect(result.idempotency).toEqual({
      first_status: 201,
      second_status: 201,
      same_id: true,
      rows: 1,
    });
    expect(result.security).toEqual({ unauthorized: 401, forbidden_origin: 403 });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);
