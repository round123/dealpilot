import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = resolve(process.argv[2] ?? join(root, "apps", "agent", "dist", "dealpilot-agent.exe"));
const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-exe-qa-")));
if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
  throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
}

const env = {
  ...Bun.env,
  DEALPILOT_DATA_DIR: temporaryRoot,
  DEALPILOT_MIGRATIONS_DIR: join(root, "apps", "agent", "migrations"),
  DEALPILOT_WEB_DIR: join(root, "apps", "web", "dist"),
  DEALPILOT_SKIP_BROWSER: "1",
  DEALPILOT_SKIP_TRAY: "1",
  DEALPILOT_SKIP_NM_REGISTRATION: "1",
};

let child: ReturnType<typeof Bun.spawn> | undefined;
try {
  const startedAt = performance.now();
  child = Bun.spawn([executable], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
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
  if (!health?.ok) throw new Error("Compiled Agent did not become healthy within 5 seconds");
  const startupMs = performance.now() - startedAt;
  const runtime = JSON.parse(await readFile(join(temporaryRoot, "agent.runtime.json"), "utf8")) as {
    token: string;
    port: number;
  };

  const backupResponse = await fetch(`http://127.0.0.1:${runtime.port}/api/v1/backups/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ password: "compiled-agent-secure-password" }),
  });
  const backup = Buffer.from(await backupResponse.arrayBuffer());

  const nm = Bun.spawn([
    process.execPath,
    "run",
    join(root, "scripts", "test-nm.ts"),
    executable,
    "mblecgcjdmeialnhjbbbbgilklkbpdhn",
  ], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
  const [nmStdout, nmStderr, nmExit] = await Promise.all([
    new Response(nm.stdout).text(),
    new Response(nm.stderr).text(),
    nm.exited,
  ]);

  child.kill();
  await child.exited;
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  console.log(JSON.stringify({
    startup_ms: Number(startupMs.toFixed(2)),
    health_status: health.status,
    backup_status: backupResponse.status,
    backup_magic: backup.subarray(0, 4).toString("ascii"),
    backup_version: backup.readUInt8(4),
    native_messaging_exit: nmExit,
    native_messaging_auth: /"type":"auth"/.test(nmStdout),
    native_messaging_stderr: nmStderr.trim(),
    startup_ready: stdout.includes("DealPilot Agent started successfully"),
    agent_stderr: stderr.trim(),
  }));
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await child.exited;
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
