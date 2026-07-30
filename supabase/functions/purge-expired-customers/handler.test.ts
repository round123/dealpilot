import assert from "node:assert/strict";
import test from "node:test";
import { createPurgeHandler, type PurgeClient } from "./handler.ts";

const requestId = "request-test-123";

const jwtForRole = (role: string) => {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.signature`;
};

const serviceAuthorization = `Bearer ${jwtForRole("service_role")}`;

const unusedClient = (): PurgeClient => ({
  rpc: async () => ({ data: null, error: null }),
  storage: {
    from: () => ({ remove: async () => ({ error: null }) }),
  },
});

const createHandler = (
  overrides: Partial<Parameters<typeof createPurgeHandler>[0]> = {},
) =>
  createPurgeHandler({
    createClient: unusedClient,
    getEnvironment: () => "configured",
    randomUUID: () => requestId,
    now: () => Date.parse("2026-07-30T00:00:00.000Z"),
    logError: () => undefined,
    ...overrides,
  });

const readError = async (response: Response) => {
  const body = (await response.json()) as {
    error: { code: string; message: string; request_id: string };
  };
  assert.equal(body.error.request_id, requestId);
  assert.equal(response.headers.get("x-request-id"), requestId);
  return body.error;
};

test("returns a request ID with 405 responses", async () => {
  const response = await createHandler()(new Request("http://local.test"));

  assert.equal(response.status, 405);
  assert.equal((await readError(response)).code, "METHOD_NOT_ALLOWED");
});

test("returns a request ID with 403 responses", async () => {
  const response = await createHandler()(
    new Request("http://local.test", { method: "POST" }),
  );

  assert.equal(response.status, 403);
  assert.equal((await readError(response)).code, "FORBIDDEN");
});

for (const [name, body] of [
  ["invalid JSON", "{"],
  ["invalid cutoff", JSON.stringify({ cutoff: "not-a-date" })],
  ["invalid enqueue limit", JSON.stringify({ enqueue_limit: 501 })],
  ["invalid claim limit", JSON.stringify({ claim_limit: 0 })],
] as const) {
  test(`returns a request ID with 400 for ${name}`, async () => {
    const response = await createHandler()(
      new Request("http://local.test", {
        method: "POST",
        headers: { authorization: serviceAuthorization },
        body,
      }),
    );

    assert.equal(response.status, 400);
    assert.equal((await readError(response)).code, "INVALID_REQUEST");
  });
}

test("does not leak internal errors in a 500 response", async () => {
  const internalMessage = "postgres password=do-not-leak";
  const response = await createHandler({
    createClient: () => {
      throw new Error(internalMessage);
    },
  })(
    new Request("http://local.test", {
      method: "POST",
      headers: {
        authorization: serviceAuthorization,
        "x-request-id": requestId,
      },
      body: "{}",
    }),
  );

  assert.equal(response.status, 500);
  const responseText = await response.clone().text();
  assert.equal(responseText.includes(internalMessage), false);
  const error = await readError(response);
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.equal(error.message, "Customer purge execution failed");
});

test("returns the request ID header on success", async () => {
  const response = await createHandler()(
    new Request("http://local.test", {
      method: "POST",
      headers: { authorization: serviceAuthorization },
      body: "{}",
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), requestId);
});
