import assert from "node:assert/strict";
import test from "node:test";

import { createDeleteAccountHandler } from "./handler.ts";

const requestId = "request-delete-account";
const handler = createDeleteAccountHandler({
  randomUUID: () => requestId,
});

test("answers CORS preflight", async () => {
  const response = await handler(
    new Request("http://local.test", { method: "OPTIONS" }),
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("rejects self-service account deletion without reading the request body", async () => {
  const response = await handler(
    new Request("http://local.test", {
      method: "POST",
      headers: { "x-request-id": requestId },
      body: JSON.stringify({ user_id: "attacker-selected-user" }),
    }),
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-request-id"), requestId);
  assert.deepEqual(await response.json(), {
    error: {
      code: "FEATURE_DISABLED",
      message: "Self-service account deletion is not available",
      request_id: requestId,
    },
  });
});

test("rejects unsupported methods", async () => {
  const response = await handler(
    new Request("http://local.test", { method: "DELETE" }),
  );

  assert.equal(response.status, 405);
});
