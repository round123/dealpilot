import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeleteAccountHandler,
  type DeleteAccountClient,
} from "./handler.ts";

const requestId = "request-delete-account";
const userId = "11111111-1111-4111-8111-111111111111";

type ClientOverrides = {
  getUser?: DeleteAccountClient["auth"]["getUser"];
  deleteUser?: DeleteAccountClient["auth"]["admin"]["deleteUser"];
  list?: ReturnType<DeleteAccountClient["storage"]["from"]>["list"];
  remove?: ReturnType<DeleteAccountClient["storage"]["from"]>["remove"];
};

const createClient = (overrides: ClientOverrides = {}) => {
  const calls = {
    getUser: [] as string[],
    deleteUser: [] as string[],
    list: [] as Array<{ path: string; offset: number }>,
    remove: [] as string[][],
  };
  const client: DeleteAccountClient = {
    auth: {
      getUser: async (jwt) => {
        calls.getUser.push(jwt);
        return overrides.getUser
          ? overrides.getUser(jwt)
          : { data: { user: { id: userId } }, error: null };
      },
      admin: {
        deleteUser: async (id) => {
          calls.deleteUser.push(id);
          return overrides.deleteUser
            ? overrides.deleteUser(id)
            : { error: null };
        },
      },
    },
    storage: {
      from: () => ({
        list: async (path, options) => {
          calls.list.push({ path, offset: options.offset });
          return overrides.list
            ? overrides.list(path, options)
            : { data: [], error: null };
        },
        remove: async (paths) => {
          calls.remove.push(paths);
          return overrides.remove ? overrides.remove(paths) : { error: null };
        },
      }),
    },
  };
  return { client, calls };
};

const createHandler = (client: DeleteAccountClient) =>
  createDeleteAccountHandler({
    createClient: () => client,
    getEnvironment: () => "configured",
    randomUUID: () => requestId,
    logError: () => undefined,
  });

const request = (authorization = "Bearer current-user-jwt") =>
  new Request("http://local.test", {
    method: "POST",
    headers: { authorization, "x-request-id": requestId },
  });

const readError = async (response: Response) => {
  const body = (await response.json()) as {
    error: { code: string; request_id: string };
  };
  assert.equal(body.error.request_id, requestId);
  return body.error;
};

test("answers CORS preflight without touching auth", async () => {
  const { client, calls } = createClient();
  const response = await createHandler(client)(
    new Request("http://local.test", { method: "OPTIONS" }),
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(calls.getUser, []);
});

test("rejects missing or invalid JWTs without deleting a user", async () => {
  const missing = createClient();
  const missingResponse = await createHandler(missing.client)(request(""));
  assert.equal(missingResponse.status, 401);
  assert.equal((await readError(missingResponse)).code, "UNAUTHORIZED");
  assert.deepEqual(missing.calls.deleteUser, []);

  const invalid = createClient({
    getUser: async () => ({
      data: { user: null },
      error: { message: "invalid token" },
    }),
  });
  const invalidResponse = await createHandler(invalid.client)(request());
  assert.equal(invalidResponse.status, 401);
  assert.deepEqual(invalid.calls.deleteUser, []);
});

test("deletes every paginated attachment before deleting the verified user", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: `object-${index}`,
    name: `${index}.txt`,
  }));
  const { client, calls } = createClient({
    list: async (_path, options) => ({
      data:
        options.offset === 0
          ? firstPage
          : [{ id: "last-object", name: "last.txt" }],
      error: null,
    }),
  });

  const response = await createHandler(client)(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { deleted: true } });
  assert.deepEqual(calls.getUser, ["current-user-jwt"]);
  assert.deepEqual(calls.list, [
    { path: userId, offset: 0 },
    { path: userId, offset: 100 },
  ]);
  assert.equal(calls.remove.length, 2);
  assert.equal(calls.remove[0].length, 100);
  assert.deepEqual(calls.remove[1], [`${userId}/last.txt`]);
  assert.deepEqual(calls.deleteUser, [userId]);
});

test("walks nested attachment directories", async () => {
  const { client, calls } = createClient({
    list: async (path) => ({
      data:
        path === userId
          ? [
              { id: null, name: "notes" },
              { id: "root-file", name: "avatar.png" },
            ]
          : [{ id: "nested-file", name: "quote.pdf" }],
      error: null,
    }),
  });

  const response = await createHandler(client)(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls.list, [
    { path: userId, offset: 0 },
    { path: `${userId}/notes`, offset: 0 },
  ]);
  assert.deepEqual(calls.remove, [
    [`${userId}/avatar.png`, `${userId}/notes/quote.pdf`],
  ]);
});

test("aborts account deletion when attachment listing fails", async () => {
  const { client, calls } = createClient({
    list: async () => ({
      data: null,
      error: { message: "storage unavailable" },
    }),
  });

  const response = await createHandler(client)(request());
  assert.equal(response.status, 500);
  assert.equal((await readError(response)).code, "ACCOUNT_DELETION_FAILED");
  assert.deepEqual(calls.remove, []);
  assert.deepEqual(calls.deleteUser, []);
});

test("aborts auth deletion when attachment removal fails", async () => {
  const { client, calls } = createClient({
    list: async () => ({
      data: [{ id: "object", name: "attachment.txt" }],
      error: null,
    }),
    remove: async () => ({ error: { message: "remove failed" } }),
  });

  const response = await createHandler(client)(request());
  assert.equal(response.status, 500);
  assert.deepEqual(calls.deleteUser, []);
});

test("never accepts a user id from the request body", async () => {
  const { client, calls } = createClient();
  const response = await createHandler(client)(
    new Request("http://local.test", {
      method: "POST",
      headers: { authorization: "Bearer current-user-jwt" },
      body: JSON.stringify({ user_id: "attacker-selected-user" }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls.deleteUser, [userId]);
});
