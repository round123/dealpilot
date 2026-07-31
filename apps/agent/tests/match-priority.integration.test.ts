import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("resolves manual bindings before E.164 phones and platform usernames", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-match-priority-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const child = Bun.spawn([
      process.execPath,
      "run",
      join(import.meta.dir, "helpers", "match-priority-runner.ts"),
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

    expect(result.manual).toMatchObject({
      status: "unique",
      customer: { id: result.ids.manual },
    });
    expect(result.phone.status).toBe("multiple");
    expect(result.phone.candidates.map(({ id }: { id: string }) => id).sort()).toEqual([
      result.ids.phoneA,
      result.ids.phoneB,
    ].sort());
    expect(result.username).toMatchObject({
      status: "unique",
      customer: { id: result.ids.username },
    });
    expect(result.none).toEqual({ status: "none" });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 15_000);
