import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const authSmokeEndpoints = ["settings", "health"];

export async function verifyExtensionProductionConfig({
  supabaseUrl = process.env.VITE_SUPABASE_URL,
  projectRef = process.env.SUPABASE_PROJECT_REF,
  publishableKey = process.env.VITE_SB_PUBLISHABLE_KEY,
  fetchImpl = fetch,
  timeoutMs = 30_000,
} = {}) {
  const ref = requiredValue(projectRef, "SUPABASE_PROJECT_REF");
  assert.match(
    ref,
    /^[a-z0-9]{20}$/,
    "SUPABASE_PROJECT_REF must be a 20-character project ref",
  );

  const configuredUrl = new URL(
    requiredValue(supabaseUrl, "VITE_SUPABASE_URL"),
  );
  assert.equal(
    configuredUrl.protocol,
    "https:",
    "VITE_SUPABASE_URL must use HTTPS",
  );
  assert.equal(
    configuredUrl.hostname,
    `${ref}.supabase.co`,
    "VITE_SUPABASE_URL host must exactly match SUPABASE_PROJECT_REF",
  );
  assert.equal(
    configuredUrl.origin,
    `https://${ref}.supabase.co`,
    "VITE_SUPABASE_URL origin must exactly match SUPABASE_PROJECT_REF",
  );
  assert.equal(
    configuredUrl.username || configuredUrl.password,
    "",
    "VITE_SUPABASE_URL must not contain credentials",
  );
  assert.equal(
    configuredUrl.pathname,
    "/",
    "VITE_SUPABASE_URL must not contain an API path",
  );
  assert.equal(
    configuredUrl.search || configuredUrl.hash,
    "",
    "VITE_SUPABASE_URL must not contain query or fragment data",
  );

  const key = requiredValue(publishableKey, "VITE_SB_PUBLISHABLE_KEY");
  assert.ok(
    !/^sb_secret_/i.test(key) && !/service[_-]?role/i.test(key),
    "The extension production smoke requires a publishable key",
  );

  for (const endpoint of authSmokeEndpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(
        new URL(`/auth/v1/${endpoint}`, configuredUrl),
        {
          headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
          },
          signal: controller.signal,
        },
      );
    } catch (error) {
      throw new assert.AssertionError({
        message: `Supabase Auth ${endpoint} smoke request failed: ${safeErrorName(error)}`,
      });
    } finally {
      clearTimeout(timeout);
    }

    assert.ok(
      response.ok,
      `Supabase Auth ${endpoint} smoke failed with HTTP ${response.status}`,
    );
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new assert.AssertionError({
        message: `Supabase Auth ${endpoint} smoke returned invalid JSON`,
      });
    }
    assert.ok(
      payload && typeof payload === "object" && !Array.isArray(payload),
      `Supabase Auth ${endpoint} smoke returned an invalid payload`,
    );
    assert.ok(
      !("error" in payload),
      `Supabase Auth ${endpoint} smoke returned an error payload`,
    );
  }

  return configuredUrl.origin;
}

function requiredValue(value, name) {
  const normalized = value?.trim();
  assert.ok(normalized, `${name} is required`);
  return normalized;
}

function safeErrorName(error) {
  return error instanceof Error ? error.name : "UnknownError";
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  const origin = await verifyExtensionProductionConfig();
  console.log(`Verified extension production Auth target: ${origin}`);
}
