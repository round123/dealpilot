import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const sourceExecutable = resolve(
  process.argv[2] ?? join(root, "apps", "agent", "dist", "dealpilot-agent.exe"),
);
const temporaryRoot = resolve(
  await mkdtemp(join(tmpdir(), "dealpilot-exe-qa-")),
);
if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
  throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
}

const executable = join(temporaryRoot, "dealpilot-agent.exe");
const dataDirectory = join(temporaryRoot, "profile");
await copyFile(sourceExecutable, executable);
await cp(join(root, "apps", "cloud", "dist"), join(temporaryRoot, "web"), {
  recursive: true,
});
await cp(
  join(root, "apps", "agent", "migrations"),
  join(temporaryRoot, "migrations"),
  { recursive: true },
);
await mkdir(dataDirectory, { recursive: true });

const env: Record<string, string | undefined> = {
  ...Bun.env,
  DEALPILOT_DATA_DIR: dataDirectory,
  DEALPILOT_SKIP_BROWSER: "1",
  DEALPILOT_SKIP_TRAY: "1",
  DEALPILOT_SKIP_NM_REGISTRATION: "1",
};
delete env.DEALPILOT_WEB_DIR;
delete env.DEALPILOT_MIGRATIONS_DIR;

let child: ReturnType<typeof Bun.spawn> | undefined;
try {
  const startedAt = performance.now();
  child = Bun.spawn([executable], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();

  let health: Response | undefined;
  while (performance.now() - startedAt < 5_000) {
    try {
      health = await fetch("http://127.0.0.1:31081/api/v1/health");
      if (health.ok) break;
    } catch {
      // Server has not bound the port yet.
    }
    await Bun.sleep(50);
  }
  if (!health?.ok)
    throw new Error("Compiled Agent did not become healthy within 5 seconds");
  const startupMs = performance.now() - startedAt;
  const runtime = JSON.parse(
    await readFile(join(dataDirectory, "agent.runtime.json"), "utf8"),
  ) as {
    token: string;
    port: number;
  };

  const workbenchResponse = await fetch(`http://127.0.0.1:${runtime.port}/`);
  const workbenchHtml = await workbenchResponse.text();
  if (!workbenchResponse.ok || !workbenchHtml.includes('id="root"')) {
    throw new Error(
      "Compiled Agent did not serve the sibling Atomic web directory",
    );
  }
  const entryScript = workbenchHtml.match(/<script[^>]+src="([^"]+\.js)"/i)?.[1];
  if (!entryScript) throw new Error("Compiled Atomic entry script was not found");
  const entryResponse = await fetch(
    new URL(entryScript, `http://127.0.0.1:${runtime.port}/`),
  );
  const entrySource = await entryResponse.text();
  const chineseDashboardBundled = entryResponse.ok && entrySource.includes("今日工作台");
  if (!chineseDashboardBundled) {
    throw new Error("Compiled Atomic bundle does not contain the Chinese dashboard");
  }

  const statsResponse = await fetch(
    `http://127.0.0.1:${runtime.port}/api/v1/stats`,
    { headers: { Authorization: `Bearer ${runtime.token}` } },
  );
  const stats = (await statsResponse.json()) as Record<string, unknown>;
  if (!statsResponse.ok || typeof stats.total_customers !== "number") {
    throw new Error("Compiled Agent authenticated stats API is unavailable");
  }

  const databasePath = join(dataDirectory, "data", "dealpilot.db");
  const databaseHeader = (await readFile(databasePath)).subarray(0, 16);
  const databaseSize = (await stat(databasePath)).size;
  if (databaseHeader.toString("ascii") !== "SQLite format 3\0") {
    throw new Error("Compiled Agent did not create a valid SQLite database");
  }

  const backupResponse = await fetch(
    `http://127.0.0.1:${runtime.port}/api/v1/backups/create`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ password: "compiled-agent-secure-password" }),
    },
  );
  const backup = Buffer.from(await backupResponse.arrayBuffer());

  const nm = Bun.spawn(
    [
      process.execPath,
      "run",
      join(root, "scripts", "test-nm.ts"),
      executable,
      "mblecgcjdmeialnhjbbbbgilklkbpdhn",
    ],
    { cwd: root, env, stdout: "pipe", stderr: "pipe" },
  );
  const [nmStdout, nmStderr, nmExit] = await Promise.all([
    new Response(nm.stdout).text(),
    new Response(nm.stderr).text(),
    nm.exited,
  ]);

  child.kill();
  await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  console.log(
    JSON.stringify({
      startup_ms: Number(startupMs.toFixed(2)),
      health_status: health.status,
      workbench_status: workbenchResponse.status,
      workbench_is_atomic_entry: workbenchHtml.includes('id="root"'),
      chinese_dashboard_bundled: chineseDashboardBundled,
      stats_status: statsResponse.status,
      stats_total_customers: stats.total_customers,
      sqlite_header: databaseHeader.toString("ascii", 0, 15),
      sqlite_size: databaseSize,
      sibling_migrations_used: !("DEALPILOT_MIGRATIONS_DIR" in env),
      nm_manifest_absent: !existsSync(
        join(dataDirectory, "com.dealpilot.agent.json"),
      ),
      backup_status: backupResponse.status,
      backup_magic: backup.subarray(0, 4).toString("ascii"),
      backup_version: backup.readUInt8(4),
      native_messaging_exit: nmExit,
      native_messaging_auth: /"type":"auth"/.test(nmStdout),
      native_messaging_stderr: nmStderr.trim(),
      startup_ready: stdout.includes("DealPilot Agent started successfully"),
      agent_stderr: stderr.trim(),
    }),
  );
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await child.exited;
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
