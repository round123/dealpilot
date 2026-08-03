import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ACCOUNT_CLEANUP_CONFIRMATION,
  createAdminCleanupHandler,
  type AdminCleanupClient,
} from "./handler.ts";

const requestId = "gha-123-1";
const userId = "41000000-0000-4000-8000-000000000001";
const jobId = "41000000-0000-4000-8000-000000000002";

const jwtForRole = (role: string) => {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.signature`;
};

const serviceAuthorization = `Bearer ${jwtForRole("service_role")}`;
const validBody = {
  target_user_id: userId,
  idempotency_key: "ticket-123",
  approval_url: "https://github.com/round123/dealpilot/issues/123",
  requested_by: "release-admin",
  confirmation: ADMIN_ACCOUNT_CLEANUP_CONFIRMATION,
};

const envelope = (data: Record<string, unknown>) => ({
  data: { data },
  error: null,
});

const createClient = (overrides: Partial<AdminCleanupClient> = {}) => {
  const client: AdminCleanupClient = {
    rpc: async (name) => {
      if (name === "request_admin_account_cleanup") {
        return envelope({
          job_id: jobId,
          status: "pending",
          attempt_count: 0,
          storage_objects_deleted: 0,
        });
      }
      if (name === "claim_admin_account_cleanup") {
        return envelope({
          job_id: jobId,
          target_user_id: userId,
          status: "processing",
          attempt_count: 1,
          storage_objects_deleted: 0,
          object_paths: [`${userId}/notes/evidence.pdf`],
          has_more_objects: false,
        });
      }
      return envelope({
        job_id: jobId,
        status:
          name === "complete_admin_account_cleanup" ? "completed" : "retry",
        attempt_count: 1,
        storage_objects_deleted: 1,
      });
    },
    storage: {
      from: () => ({ remove: async () => ({ error: null }) }),
    },
    auth: {
      admin: {
        deleteUser: async () => ({ error: null }),
      },
    },
    ...overrides,
  };
  return client;
};

const createHandler = (
  client: AdminCleanupClient = createClient(),
  logs: Array<Record<string, unknown>> = [],
) =>
  createAdminCleanupHandler({
    createClient: () => client,
    getEnvironment: () => "configured",
    randomUUID: () => requestId,
    logError: (_message, details) => logs.push(details),
  });

const request = (
  body: Record<string, unknown> = validBody,
  role = "service_role",
) =>
  new Request("http://local.test", {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwtForRole(role)}`,
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });

test("rejects browser tokens before constructing a service client", async () => {
  let constructed = false;
  const handler = createAdminCleanupHandler({
    createClient: () => {
      constructed = true;
      return createClient();
    },
    getEnvironment: () => "configured",
    randomUUID: () => requestId,
  });

  const response = await handler(request(validBody, "authenticated"));
  assert.equal(response.status, 403);
  assert.equal(constructed, false);
  assert.equal((await response.json()).error.code, "FORBIDDEN");
});

for (const [name, body] of [
  ["target UUID", { ...validBody, target_user_id: "not-a-uuid" }],
  ["approval URL", { ...validBody, approval_url: "http://insecure.test/1" }],
  [
    "approval URL whitespace",
    { ...validBody, approval_url: "https://example.test/ok\ninjected" },
  ],
  ["confirmation", { ...validBody, confirmation: "DELETE" }],
  ["idempotency key", { ...validBody, idempotency_key: "ticket 123" }],
] as const) {
  test(`rejects invalid ${name}`, async () => {
    const response = await createHandler()(request(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_REQUEST");
  });
}

test("removes the exact storage snapshot before hard-deleting Auth and completing", async () => {
  const calls: string[] = [];
  const base = createClient();
  const client = createClient({
    rpc: async (name, parameters) => {
      calls.push(`rpc:${name}`);
      return base.rpc(name, parameters);
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.push(`storage:${bucket}:${paths.join(",")}`);
          return { error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (target, softDelete) => {
          calls.push(`auth:${target}:${softDelete}`);
          return { error: null };
        },
      },
    },
  });

  const response = await createHandler(client)(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, "completed");
  assert.deepEqual(calls, [
    "rpc:request_admin_account_cleanup",
    "rpc:claim_admin_account_cleanup",
    `storage:attachments:${userId}/notes/evidence.pdf`,
    `auth:${userId}:false`,
    "rpc:complete_admin_account_cleanup",
  ]);
});

test("treats an already absent Auth user as a retry-safe completion", async () => {
  const base = createClient();
  const client = createClient({
    auth: {
      admin: {
        deleteUser: async () => ({
          error: { code: "user_not_found", status: 404 },
        }),
      },
    },
    rpc: base.rpc,
  });

  const response = await createHandler(client)(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, "completed");
});

test("does not delete Auth while more storage objects remain and saves retry progress", async () => {
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];
  let authCalled = false;
  const base = createClient();
  const client = createClient({
    rpc: async (name, parameters) => {
      rpcCalls.push([name, parameters]);
      if (name === "claim_admin_account_cleanup") {
        return envelope({
          job_id: jobId,
          target_user_id: userId,
          status: "processing",
          attempt_count: 1,
          storage_objects_deleted: 0,
          object_paths: [`${userId}/batch/file.txt`],
          has_more_objects: true,
        });
      }
      return base.rpc(name, parameters);
    },
    auth: {
      admin: {
        deleteUser: async () => {
          authCalled = true;
          return { error: null };
        },
      },
    },
  });

  const response = await createHandler(client)(request());
  assert.equal(response.status, 503);
  assert.equal(authCalled, false);
  assert.equal(rpcCalls.at(-1)?.[0], "fail_admin_account_cleanup");
  assert.deepEqual(rpcCalls.at(-1)?.[1], {
    p_job_id: jobId,
    p_error_code: "STORAGE_BATCH_REMAINING",
    p_storage_objects_deleted: 1,
  });
});

test("persists only a sanitized error code when storage deletion fails", async () => {
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];
  const logs: Array<Record<string, unknown>> = [];
  const base = createClient();
  const client = createClient({
    rpc: async (name, parameters) => {
      rpcCalls.push([name, parameters]);
      return base.rpc(name, parameters);
    },
    storage: {
      from: () => ({
        remove: async () => ({
          error: { message: "secret token=must-not-be-persisted" },
        }),
      }),
    },
  });

  const response = await createHandler(client, logs)(request());
  const responseText = await response.text();
  assert.equal(response.status, 503);
  assert.equal(responseText.includes("must-not-be-persisted"), false);
  assert.equal(JSON.stringify(logs).includes("must-not-be-persisted"), false);
  assert.equal(rpcCalls.at(-1)?.[1].p_error_code, "STORAGE_DELETE_FAILED");
});

test("replays a completed idempotency key without Storage or Auth calls", async () => {
  let externalCalls = 0;
  const client = createClient({
    rpc: async () =>
      envelope({
        job_id: jobId,
        status: "completed",
        attempt_count: 2,
        storage_objects_deleted: 3,
      }),
    storage: {
      from: () => ({
        remove: async () => {
          externalCalls += 1;
          return { error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async () => {
          externalCalls += 1;
          return { error: null };
        },
      },
    },
  });

  const response = await createHandler(client)(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.replayed, true);
  assert.equal(externalCalls, 0);
});
