import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("exports every local business domain as an Excel workbook", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-export-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(import.meta.dir, "helpers", "full-export-runner.ts");
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

    expect(result.status).toBe(200);
    expect(result.content_type).toContain("spreadsheetml.sheet");
    expect(result.disposition).toContain("dealpilot-all-data-");
    expect(result.sheets).toEqual([
      "客户",
      "联系人",
      "社媒账号",
      "项目",
      "跟进",
      "提醒",
      "风险",
      "里程碑",
    ]);
    expect(result.customer_name).toBe("全域导出客户");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);
