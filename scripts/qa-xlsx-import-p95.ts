import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const runner = join(
  root,
  "apps",
  "agent",
  "tests",
  "helpers",
  "acceptance-scale-runner.ts",
);
const samples = Number(process.argv[2] ?? 10);
if (!Number.isInteger(samples) || samples < 2) {
  throw new Error("Sample count must be an integer of at least 2");
}
const durations: number[] = [];

for (let index = 0; index < samples; index++) {
  const temporaryRoot = resolve(
    await mkdtemp(join(tmpdir(), "dealpilot-xlsx-p95-")),
  );
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing unexpected temp path: ${temporaryRoot}`);
  }
  try {
    const child = Bun.spawn(
      [process.execPath, "run", runner, "xlsx-import"],
      {
        cwd: join(root, "apps", "agent"),
        env: { ...Bun.env, DEALPILOT_DATA_DIR: temporaryRoot },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0) throw new Error(stderr);
    const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!);
    if (result.imported_rows !== 1000) {
      throw new Error(`XLSX sample ${index + 1} imported ${result.imported_rows} rows`);
    }
    durations.push(result.duration_ms);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

durations.sort((a, b) => a - b);
console.log(JSON.stringify({
  samples,
  format: "xlsx",
  rows_per_sample: 1000,
  min_ms: durations[0],
  median_ms: durations[Math.floor(durations.length / 2)],
  empirical_p95_ms: durations[Math.ceil(durations.length * 0.95) - 1],
  max_ms: durations.at(-1),
  threshold_ms: 30_000,
  passed: durations[Math.ceil(durations.length * 0.95) - 1] < 30_000,
}));
