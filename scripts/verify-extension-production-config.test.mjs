import assert from "node:assert/strict";
import test from "node:test";

import { verifyExtensionProductionConfig } from "./verify-extension-production-config.mjs";

const projectRef = "abcdefghijklmnopqrst";
const supabaseUrl = `https://${projectRef}.supabase.co`;
const publishableKey = "sb_publishable_public-test-key";

test("smokes production Auth settings and health with the publishable key", async () => {
  const requests = [];
  const origin = await verifyExtensionProductionConfig({
    supabaseUrl,
    projectRef,
    publishableKey,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), headers: options.headers });
      return Response.json({ status: "ok" });
    },
  });

  assert.equal(origin, supabaseUrl);
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      `${supabaseUrl}/auth/v1/settings`,
      `${supabaseUrl}/auth/v1/health`,
    ],
  );
  for (const request of requests) {
    assert.equal(request.headers.apikey, publishableKey);
    assert.equal(request.headers.authorization, `Bearer ${publishableKey}`);
  }
});

test("rejects a preview URL that does not match the production project ref", async () => {
  await assert.rejects(
    verifyExtensionProductionConfig({
      supabaseUrl: "https://previewprojectref00.supabase.co",
      projectRef,
      publishableKey,
      fetchImpl: () => assert.fail("Auth smoke must not run for the wrong host"),
    }),
    /host must exactly match/,
  );
});

test("rejects a custom port on the otherwise correct production host", async () => {
  await assert.rejects(
    verifyExtensionProductionConfig({
      supabaseUrl: `${supabaseUrl}:8443`,
      projectRef,
      publishableKey,
      fetchImpl: () => assert.fail("Auth smoke must not run for the wrong origin"),
    }),
    /origin must exactly match/,
  );
});

test("rejects a publishable key that Auth does not accept", async () => {
  await assert.rejects(
    verifyExtensionProductionConfig({
      supabaseUrl,
      projectRef,
      publishableKey: "wrong-publishable-key",
      fetchImpl: async () => Response.json({ message: "invalid key" }, { status: 401 }),
    }),
    /settings smoke failed with HTTP 401/,
  );
});

test("rejects a non-JSON successful Auth response", async () => {
  await assert.rejects(
    verifyExtensionProductionConfig({
      supabaseUrl,
      projectRef,
      publishableKey,
      fetchImpl: async () => new Response("ok"),
    }),
    /settings smoke returned invalid JSON/,
  );
});
