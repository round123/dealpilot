import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("supports extension search, binding lifecycle, and popup launch metadata", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-extension-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(import.meta.dir, "helpers", "extension-workflows-runner.ts");
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

    expect(result.search.status).toBe(200);
    expect(result.search.ids).toHaveLength(1);
    expect(result.bind_status).toBe(201);
    expect(result.popup).toHaveLength(1);
    expect(result.popup[0]).toMatchObject({
      customer_name: "Extension Search Customer",
      project_name: "高风险履约项目",
      has_high_risk: true,
      conversation_target: {
        platform: "whatsapp",
        raw_identifier: "+86 138-0000-4321",
      },
    });
    expect(result.rebind.status).toBe(201);
    expect(result.rebind.customer_id).toBeTruthy();
    expect(result.rebind.customer_id).not.toBe(result.search.ids[0]);
    expect(result.unbind).toEqual({ status: 204, match_status: "none" });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 20_000);
