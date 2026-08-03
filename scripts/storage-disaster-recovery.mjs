import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const MANIFEST_VERSION = 1;
const PAGE_SIZE = 1000;
const RETRIES = 3;

function required(value, name) {
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function endpoint(value) {
  const parsed = new URL(required(value, "SUPABASE_URL"));
  const allowLocal = process.env.DR_ALLOW_INSECURE_LOCAL === "true";
  if (
    parsed.protocol !== "https:" &&
    !(allowLocal && ["127.0.0.1", "localhost"].includes(parsed.hostname))
  ) {
    throw new Error("SUPABASE_URL must use HTTPS");
  }
  return parsed.href.replace(/\/$/, "");
}

function objectPath(name) {
  return name.split("/").map(encodeURIComponent).join("/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function apiFetch(baseUrl, key, pathname, options = {}) {
  let response;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: {
          apikey: key,
          authorization: `Bearer ${key}`,
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
      });
      if (response.ok || response.status < 500 || attempt === RETRIES) break;
    } catch (error) {
      if (attempt === RETRIES)
        throw new Error(`Storage request failed after ${RETRIES} attempts`, {
          cause: error,
        });
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  if (!response?.ok)
    throw new Error(
      `Storage request failed with HTTP ${response?.status ?? "unknown"}`,
    );
  return response;
}

async function listObjects(baseUrl, key, bucket) {
  const objects = [];
  const prefixes = [""];
  const visited = new Set();

  while (prefixes.length > 0) {
    const prefix = prefixes.shift();
    if (visited.has(prefix)) continue;
    visited.add(prefix);
    let offset = 0;
    while (true) {
      const response = await apiFetch(
        baseUrl,
        key,
        `/storage/v1/object/list/${encodeURIComponent(bucket)}`,
        {
          method: "POST",
          body: JSON.stringify({
            prefix,
            limit: PAGE_SIZE,
            offset,
            sortBy: { column: "name", order: "asc" },
          }),
        },
      );
      const entries = await response.json();
      if (!Array.isArray(entries))
        throw new Error("Storage list response is not an array");
      for (const entry of entries) {
        if (
          !entry ||
          typeof entry.name !== "string" ||
          entry.name.length === 0
        ) {
          throw new Error("Storage list contains an invalid entry");
        }
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id == null && entry.metadata == null) prefixes.push(name);
        else objects.push(name);
      }
      if (entries.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  return [...new Set(objects)].sort();
}

export async function backupStorage({
  baseUrl,
  serviceRoleKey,
  bucket,
  outputDirectory,
}) {
  await mkdir(path.join(outputDirectory, "objects"), {
    recursive: true,
    mode: 0o700,
  });
  const names = await listObjects(baseUrl, serviceRoleKey, bucket);
  const objects = [];

  for (const name of names) {
    const response = await apiFetch(
      baseUrl,
      serviceRoleKey,
      `/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${objectPath(name)}`,
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    const archiveName = sha256(Buffer.from(name, "utf8"));
    await writeFile(path.join(outputDirectory, "objects", archiveName), bytes, {
      mode: 0o600,
    });
    objects.push({
      name,
      archive_name: archiveName,
      content_type:
        response.headers.get("content-type") || "application/octet-stream",
      size: bytes.length,
      sha256: sha256(bytes),
    });
  }

  const manifest = { schema_version: MANIFEST_VERSION, bucket, objects };
  await writeFile(
    path.join(outputDirectory, "storage-manifest.json"),
    `${JSON.stringify(manifest)}\n`,
    { mode: 0o600 },
  );
  return { objectCount: objects.length };
}

async function readAndVerifyManifest(directory, expectedBucket) {
  const manifest = JSON.parse(
    await readFile(path.join(directory, "storage-manifest.json"), "utf8"),
  );
  if (
    manifest.schema_version !== MANIFEST_VERSION ||
    manifest.bucket !== expectedBucket ||
    !Array.isArray(manifest.objects)
  ) {
    throw new Error("Storage manifest is incompatible");
  }
  const names = new Set();
  for (const item of manifest.objects) {
    if (
      !item ||
      typeof item.name !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.archive_name) ||
      names.has(item.name)
    ) {
      throw new Error(
        "Storage manifest contains an invalid or duplicate object",
      );
    }
    names.add(item.name);
    const bytes = await readFile(
      path.join(directory, "objects", item.archive_name),
    );
    if (
      bytes.length !== item.size ||
      sha256(bytes) !== item.sha256 ||
      sha256(Buffer.from(item.name, "utf8")) !== item.archive_name
    ) {
      throw new Error("Storage object integrity verification failed");
    }
  }
  return manifest;
}

async function clearBucket(baseUrl, key, bucket) {
  const names = await listObjects(baseUrl, key, bucket);
  for (let index = 0; index < names.length; index += 100) {
    await apiFetch(
      baseUrl,
      key,
      `/storage/v1/object/${encodeURIComponent(bucket)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ prefixes: names.slice(index, index + 100) }),
      },
    );
  }
}

export async function restoreStorage({
  baseUrl,
  serviceRoleKey,
  bucket,
  inputDirectory,
  clearTarget = false,
}) {
  const manifest = await readAndVerifyManifest(inputDirectory, bucket);
  if (clearTarget) await clearBucket(baseUrl, serviceRoleKey, bucket);
  for (const item of manifest.objects) {
    const bytes = await readFile(
      path.join(inputDirectory, "objects", item.archive_name),
    );
    await apiFetch(
      baseUrl,
      serviceRoleKey,
      `/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath(item.name)}`,
      {
        method: "POST",
        body: bytes,
        headers: { "content-type": item.content_type, "x-upsert": "true" },
      },
    );
  }
  return { objectCount: manifest.objects.length };
}

async function main() {
  const [command, directory] = process.argv.slice(2);
  if (!command || !directory || !["backup", "restore"].includes(command)) {
    throw new Error(
      "Usage: storage-disaster-recovery.mjs <backup|restore> <directory>",
    );
  }
  const options = {
    baseUrl: endpoint(process.env.SUPABASE_URL),
    serviceRoleKey: required(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
    bucket: process.env.ATTACHMENTS_BUCKET || "attachments",
  };
  const result =
    command === "backup"
      ? await backupStorage({ ...options, outputDirectory: directory })
      : await restoreStorage({
          ...options,
          inputDirectory: directory,
          clearTarget: process.env.DR_CLEAR_TARGET === "true",
        });
  console.log(`Storage ${command} completed (${result.objectCount} objects).`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Storage disaster-recovery command failed",
    );
    process.exitCode = 1;
  });
}
