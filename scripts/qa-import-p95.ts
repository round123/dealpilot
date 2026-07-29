import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const runner = join(root, "apps", "agent", "tests", "helpers", "phase4-qa-runner.ts");
const iterations = Number(process.argv[2] ?? 20);
const durations: number[] = [];

for (let index = 0; index < iterations; index++) {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-import-p95-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }
  try {
    const child = Bun.spawn([process.execPath, "run", runner], {
      cwd: join(root, "apps", "agent"),
      env: { ...Bun.env, DEALPILOT_DATA_DIR: temporaryRoot },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0) throw new Error(stderr);
    const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!);
    durations.push(result.import_1000.duration_ms);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

durations.sort((a, b) => a - b);
const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? 0;
console.log(JSON.stringify({
  iterations,
  min_ms: durations[0],
  median_ms: durations[Math.floor(durations.length / 2)],
  p95_ms: p95,
  max_ms: durations.at(-1),
  threshold_ms: 30_000,
  passed: p95 < 30_000,
}));
