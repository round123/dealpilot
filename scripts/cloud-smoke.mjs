import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_FUNCTIONS = ["purge-expired-customers", "delete-account"];

export async function runCloudSmoke({
  webUrl,
  supabaseUrl,
  publishableKey,
  releaseSha,
  functions = DEFAULT_FUNCTIONS,
  attempts = 12,
  retryDelayMs = 5_000,
  fetchImpl = fetch,
}) {
  const webBase = withTrailingSlash(webUrl);
  const apiBase = supabaseUrl.replace(/\/$/, "");

  await retry("Web release marker", attempts, retryDelayMs, async () => {
    const response = await fetchImpl(new URL("release.json", webBase));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const marker = await response.json();
    if (marker.sha !== releaseSha) {
      throw new Error(
        `expected ${releaseSha}, received ${marker.sha ?? "none"}`,
      );
    }
  });

  await retry("Supabase Auth health", attempts, retryDelayMs, async () => {
    const response = await fetchImpl(`${apiBase}/auth/v1/health`, {
      headers: { apikey: publishableKey },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  });

  await retry("PostgREST health", attempts, retryDelayMs, async () => {
    const response = await fetchImpl(`${apiBase}/rest/v1/`, {
      headers: { apikey: publishableKey },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  });

  for (const functionName of functions) {
    await retry(
      `Unauthenticated Edge rejection (${functionName})`,
      attempts,
      retryDelayMs,
      async () => {
        const response = await fetchImpl(
          `${apiBase}/functions/v1/${functionName}`,
          {
            method: "POST",
            headers: {
              apikey: publishableKey,
              "content-type": "application/json",
            },
            body: "{}",
          },
        );
        if (![401, 403].includes(response.status)) {
          throw new Error(`expected 401/403, received ${response.status}`);
        }
      },
    );
  }

  return { releaseSha, checkedFunctions: functions };
}

async function retry(label, attempts, delayMs, operation) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await operation();
      console.log(`PASS ${label}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts`, {
    cause: lastError,
  });
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function main() {
  const required = [
    "CLOUD_WEB_URL",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "RELEASE_SHA",
  ];
  for (const name of required) {
    if (!process.env[name]) throw new Error(`${name} is required`);
  }

  const result = await runCloudSmoke({
    webUrl: process.env.CLOUD_WEB_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    releaseSha: process.env.RELEASE_SHA,
    functions: (
      process.env.CLOUD_SMOKE_FUNCTIONS ?? DEFAULT_FUNCTIONS.join(",")
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  });
  console.log(`Cloud pre-login smoke passed for ${result.releaseSha}.`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
