import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { backupStorage, restoreStorage } from "./storage-disaster-recovery.mjs";
import {
  createManifest,
  verifyManifest,
} from "./disaster-recovery-manifest.mjs";

async function withStorageServer(run) {
  const uploads = new Map();
  let deletes = 0;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (
      request.method === "POST" &&
      request.url === "/storage/v1/object/list/attachments"
    ) {
      const { prefix } = JSON.parse(body.toString("utf8"));
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify(
          prefix === ""
            ? [{ name: "owner", id: null, metadata: null }]
            : [{ name: "quote.txt", id: "1", metadata: {} }],
        ),
      );
      return;
    }
    if (
      request.method === "GET" &&
      request.url ===
        "/storage/v1/object/authenticated/attachments/owner/quote.txt"
    ) {
      response.setHeader("content-type", "text/plain");
      response.end("sensitive fixture");
      return;
    }
    if (
      request.method === "DELETE" &&
      request.url === "/storage/v1/object/attachments"
    ) {
      deletes += 1;
      response.setHeader("content-type", "application/json");
      response.end("[]");
      return;
    }
    if (
      request.method === "POST" &&
      request.url === "/storage/v1/object/attachments/owner/quote.txt"
    ) {
      uploads.set("owner/quote.txt", body);
      response.setHeader("content-type", "application/json");
      response.end("{}");
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    await run({
      baseUrl: `http://127.0.0.1:${address.port}`,
      uploads,
      getDeletes: () => deletes,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Storage archive hashes opaque files and restores verified bytes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dealpilot-dr-"));
  await withStorageServer(async ({ baseUrl, uploads, getDeletes }) => {
    const backup = await backupStorage({
      baseUrl,
      serviceRoleKey: "test-secret",
      bucket: "attachments",
      outputDirectory: directory,
    });
    assert.equal(backup.objectCount, 1);
    const manifest = JSON.parse(
      await readFile(path.join(directory, "storage-manifest.json"), "utf8"),
    );
    assert.equal(manifest.objects[0].name, "owner/quote.txt");
    assert.match(manifest.objects[0].archive_name, /^[a-f0-9]{64}$/);
    const restore = await restoreStorage({
      baseUrl,
      serviceRoleKey: "test-secret",
      bucket: "attachments",
      inputDirectory: directory,
      clearTarget: true,
    });
    assert.equal(restore.objectCount, 1);
    assert.equal(getDeletes(), 1);
    assert.equal(
      uploads.get("owner/quote.txt").toString("utf8"),
      "sensitive fixture",
    );
  });
});

test("Storage restore rejects tampering before upload", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dealpilot-dr-tamper-"));
  await withStorageServer(async ({ baseUrl, uploads }) => {
    await backupStorage({
      baseUrl,
      serviceRoleKey: "test-secret",
      bucket: "attachments",
      outputDirectory: directory,
    });
    const manifest = JSON.parse(
      await readFile(path.join(directory, "storage-manifest.json"), "utf8"),
    );
    await writeFile(
      path.join(directory, "objects", manifest.objects[0].archive_name),
      "changed",
    );
    await assert.rejects(
      restoreStorage({
        baseUrl,
        serviceRoleKey: "test-secret",
        bucket: "attachments",
        inputDirectory: directory,
      }),
      /integrity verification failed/,
    );
    assert.equal(uploads.size, 0);
  });
});

test("Outer manifest detects database dump changes", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "dealpilot-dr-manifest-"),
  );
  await mkdir(path.join(directory, "storage"));
  await writeFile(path.join(directory, "database.sql"), "select 1;\n");
  await writeFile(
    path.join(directory, "storage", "storage-manifest.json"),
    "{}\n",
  );
  await createManifest(directory, {
    sourceCommit: "a".repeat(40),
    sourceRunId: "123",
  });
  await verifyManifest(directory);
  await writeFile(path.join(directory, "database.sql"), "select 2;\n");
  await assert.rejects(verifyManifest(directory), /database\.sql/);
});

test("Workflows upload ciphertext only and keep the age identity off GitHub secrets", () => {
  const backup = readFileSync(".github/workflows/backup-cloud.yml", "utf8");
  const restore = readFileSync(
    ".github/workflows/restore-cloud-backup.yml",
    "utf8",
  );
  assert.match(backup, /retention-days: 35/);
  assert.match(backup, /age --recipient/);
  assert.match(backup, /path: \$\{\{ steps\.archive\.outputs\.encrypted \}\}/);
  assert.doesNotMatch(backup, /upload-artifact[\s\S]{0,300}DR_PAYLOAD/);
  assert.match(backup, /--exclude auth\.sessions/);
  assert.match(backup, /--exclude auth\.refresh_tokens/);
  assert.match(backup, /--exclude auth\.mfa_factors/);
  assert.match(restore, /- self-hosted[\s\S]*- dealpilot-dr/);
  assert.match(
    restore,
    /AGE_IDENTITY_FILE: \$\{\{ vars\.AGE_IDENTITY_FILE \}\}/,
  );
  assert.doesNotMatch(restore, /secrets\.BACKUP_AGE_IDENTITY/);
  assert.match(restore, /DR_RESTORE_ALLOWED/);
  assert.match(restore, /\.path == "\.github\/workflows\/backup-cloud\.yml"/);
  assert.match(restore, /\.head_branch == "main"/);
  assert.match(restore, /\.conclusion == "success"/);
  assert.match(restore, /dealpilot-dr-\$\{BACKUP_RUN_ID\}-/);
  assert.match(restore, /RESTORE PRODUCTION FROM ENCRYPTED BACKUP/);
  assert.match(restore, /supabase db reset --linked --no-seed --yes/);
});

test("Disaster recovery actions are immutable and cannot inherit job secrets", () => {
  for (const workflowPath of [
    ".github/workflows/backup-cloud.yml",
    ".github/workflows/restore-cloud-backup.yml",
  ]) {
    const workflow = readFileSync(workflowPath, "utf8");
    const stepsOffset = workflow.indexOf("    steps:");
    assert.notEqual(stepsOffset, -1, `${workflowPath} must define job steps`);
    assert.doesNotMatch(
      workflow.slice(0, stepsOffset),
      /^    env:/m,
      `${workflowPath} must not expose secrets through job-level env`,
    );

    const lines = workflow.split(/\r?\n/);
    const actionIndexes = lines.flatMap((line, index) =>
      /^      - uses:/.test(line) ? [index] : [],
    );
    assert.ok(actionIndexes.length > 0, `${workflowPath} must use actions`);

    for (const actionIndex of actionIndexes) {
      const actionReference = lines[actionIndex].match(
        /^      - uses: [^@\s]+@([0-9a-f]{40})(?:\s+#\s+v\d+)?$/,
      );
      assert.ok(
        actionReference,
        `${workflowPath}:${actionIndex + 1} must pin uses to a full SHA`,
      );

      const nextStepOffset = lines
        .slice(actionIndex + 1)
        .findIndex((line) => /^      - /.test(line));
      const actionEnd =
        nextStepOffset === -1
          ? lines.length
          : actionIndex + 1 + nextStepOffset;
      const actionBlock = lines.slice(actionIndex, actionEnd).join("\n");
      assert.doesNotMatch(
        actionBlock,
        /\$\{\{\s*(?:secrets|vars)\./,
        `${workflowPath}:${actionIndex + 1} action must not receive DR credentials`,
      );
    }
  }
});
