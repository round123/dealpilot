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

test("expects the retired account deletion endpoint to remain unavailable", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/release.json") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ sha: "release-sha" }));
      return;
    }
    if (request.url === "/functions/v1/delete-account") {
      response.statusCode = 404;
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
    functions: ["delete-account"],
    attempts: 1,
  });
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

test("authenticates and verifies the Customer count and related summary", async (t) => {
  const seen = [];
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    seen.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body,
    });
    response.setHeader("content-type", "application/json");
    if (request.url === "/release.json") {
      response.end(JSON.stringify({ sha: "release-sha" }));
      return;
    }
    if (request.url === "/auth/v1/token?grant_type=password") {
      response.end(JSON.stringify({ access_token: "smoke-token" }));
      return;
    }
    if (request.url === "/rest/v1/companies?select=id&deleted_at=is.null") {
      response.setHeader("content-range", "0-0/3");
      response.end('[{"id":"customer-id"}]');
      return;
    }
    if (request.url === "/rest/v1/rpc/get_customer_detail") {
      response.end(
        JSON.stringify({
          data: {
            id: "customer-id",
            name: "Smoke Customer",
            contacts: [{ id: "contact" }],
            social_accounts: [],
            deals: [{ id: "deal" }],
            recent_follow_ups: [{ id: "follow-up" }],
            open_reminders: [{ id: "reminder-1" }, { id: "reminder-2" }],
          },
        }),
      );
      return;
    }
    if (request.url?.startsWith("/functions/v1/")) {
      response.statusCode = 401;
      response.end("{}");
      return;
    }
    response.statusCode = 200;
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(typeof address, "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await runCloudSmoke({
    webUrl: baseUrl,
    supabaseUrl: baseUrl,
    publishableKey: "public-key",
    releaseSha: "release-sha",
    functions: [],
    attempts: 1,
    authenticatedCustomer: {
      email: "smoke@example.test",
      password: "not-logged",
      expected: {
        id: "customer-id",
        name: "Smoke Customer",
        active_customer_count: 3,
        contacts: 1,
        social_accounts: 0,
        deals: 1,
        recent_follow_ups: 1,
        open_reminders: 2,
      },
    },
  });

  assert.equal(result.checkedCustomerId, "customer-id");
  const customerRequests = seen.filter(({ authorization }) => authorization);
  assert.equal(customerRequests.length, 2);
  assert.ok(
    customerRequests.every(
      ({ authorization }) => authorization === "Bearer smoke-token",
    ),
  );
  assert.equal(
    customerRequests.at(-1).body,
    JSON.stringify({ p_customer_id: "customer-id" }),
  );
});

test("rejects a changed authenticated Customer summary", async (t) => {
  const server = createServer(async (request, response) => {
    await readRequestBody(request);
    response.setHeader("content-type", "application/json");
    if (request.url === "/release.json") {
      response.end(JSON.stringify({ sha: "release-sha" }));
    } else if (request.url === "/auth/v1/token?grant_type=password") {
      response.end(JSON.stringify({ access_token: "smoke-token" }));
    } else if (
      request.url === "/rest/v1/companies?select=id&deleted_at=is.null"
    ) {
      response.setHeader("content-range", "0-0/1");
      response.end("[]");
    } else if (request.url === "/rest/v1/rpc/get_customer_detail") {
      response.end(
        JSON.stringify({
          data: {
            id: "customer-id",
            name: "Smoke Customer",
            contacts: [],
            social_accounts: [],
            deals: [],
            recent_follow_ups: [],
            open_reminders: [],
          },
        }),
      );
    } else {
      response.statusCode = 200;
      response.end("{}");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.notEqual(typeof address, "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await assert.rejects(
    runCloudSmoke({
      webUrl: baseUrl,
      supabaseUrl: baseUrl,
      publishableKey: "public-key",
      releaseSha: "release-sha",
      functions: [],
      attempts: 1,
      authenticatedCustomer: {
        email: "smoke@example.test",
        password: "not-logged",
        expected: {
          id: "customer-id",
          name: "Smoke Customer",
          active_customer_count: 1,
          contacts: 1,
          social_accounts: 0,
          deals: 0,
          recent_follow_ups: 0,
          open_reminders: 0,
        },
      },
    }),
    /Authenticated Customer detail summary failed/,
  );
});

const readRequestBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
};
