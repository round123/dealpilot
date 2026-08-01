import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { runCloudSmoke } from "./cloud-smoke.mjs";

test("checks release identity, PostgreSQL services and pre-login Edge denial", async (t) => {
  const seen = [];
  const server = createServer((request, response) => {
    seen.push(`${request.method} ${request.url}`);
    if (request.url === "/release.json") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ sha: "release-sha" }));
      return;
    }
    if (request.url?.startsWith("/functions/v1/")) {
      response.statusCode = 401;
      response.end();
      return;
    }
    response.statusCode = 200;
    response.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(typeof address, "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await runCloudSmoke({
    webUrl: baseUrl,
    supabaseUrl: baseUrl,
    publishableKey: "public-key",
    releaseSha: "release-sha",
    functions: ["example"],
    attempts: 1,
  });

  assert.deepEqual(seen, [
    "GET /release.json",
    "GET /auth/v1/health",
    "GET /rest/v1/",
    "POST /functions/v1/example",
  ]);
});

test("rejects a stale Web release marker", async () => {
  await assert.rejects(
    runCloudSmoke({
      webUrl: "https://example.test",
      supabaseUrl: "https://example.test",
      publishableKey: "public-key",
      releaseSha: "new-sha",
      attempts: 1,
      fetchImpl: async () =>
        new Response(JSON.stringify({ sha: "old-sha" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    }),
    /Web release marker failed/,
  );
});
