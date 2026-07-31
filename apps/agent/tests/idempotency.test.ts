import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { ApiError } from "../src/errors/api-error";
import { idempotencyMiddleware } from "../src/middleware/idempotency";

function createTestApp() {
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    return c.json({ error: { code: "INTERNAL_ERROR" } }, 500);
  });
  app.use("*", idempotencyMiddleware);
  return app;
}

function idempotencyHeaders(key: string) {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": key,
  };
}

describe("idempotency middleware", () => {
  test("scopes a key by query string and rejects a different request body", async () => {
    const app = createTestApp();
    let executions = 0;
    app.post("/items", async (c) => {
      executions += 1;
      return c.json({ mode: c.req.query("mode"), input: await c.req.json(), executions }, 201);
    });
    const key = crypto.randomUUID();

    const first = await app.request("/items?mode=first", {
      method: "POST",
      headers: idempotencyHeaders(key),
      body: JSON.stringify({ value: 1 }),
    });
    const otherQuery = await app.request("/items?mode=second", {
      method: "POST",
      headers: idempotencyHeaders(key),
      body: JSON.stringify({ value: 1 }),
    });
    const conflictingBody = await app.request("/items?mode=first", {
      method: "POST",
      headers: idempotencyHeaders(key),
      body: JSON.stringify({ value: 2 }),
    });

    expect(first.status).toBe(201);
    expect(otherQuery.status).toBe(201);
    expect(executions).toBe(2);
    expect(await otherQuery.json()).toMatchObject({ mode: "second", executions: 2 });
    expect(conflictingBody.status).toBe(409);
    expect(await conflictingBody.json()).toEqual({
      error: {
        code: "CONFLICT",
        message: "Idempotency key was already used with a different request body",
      },
    });
  });

  test("replays status, headers, and arbitrary response bytes exactly", async () => {
    const app = createTestApp();
    let executions = 0;
    app.post("/binary", () => {
      executions += 1;
      return new Response(Uint8Array.from([0, 127, 255]), {
        status: 202,
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Execution": String(executions),
        },
      });
    });
    const key = crypto.randomUUID();
    const init = {
      method: "POST",
      headers: idempotencyHeaders(key),
      body: JSON.stringify({ value: 1 }),
    };

    const first = await app.request("/binary", init);
    const replayed = await app.request("/binary", init);

    expect(executions).toBe(1);
    expect([first.status, replayed.status]).toEqual([202, 202]);
    expect(replayed.headers.get("content-type")).toBe("application/octet-stream");
    expect(replayed.headers.get("x-execution")).toBe("1");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(Uint8Array.from([0, 127, 255]));
    expect(new Uint8Array(await replayed.arrayBuffer())).toEqual(Uint8Array.from([0, 127, 255]));
  });

  test("shares an in-flight failure but allows a later retry", async () => {
    const app = createTestApp();
    let executions = 0;
    let release!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    app.post("/unstable", async (c) => {
      executions += 1;
      if (executions === 1) {
        markStarted();
        await held;
        throw new Error("simulated failure");
      }
      return c.json({ executions });
    });
    const key = crypto.randomUUID();
    const init = {
      method: "POST",
      headers: idempotencyHeaders(key),
      body: JSON.stringify({ value: 1 }),
    };

    const firstPromise = app.request("/unstable", init);
    await started;
    const concurrentPromise = app.request("/unstable", init);
    await Bun.sleep(10);
    release();
    const [first, concurrent] = await Promise.all([firstPromise, concurrentPromise]);
    const retry = await app.request("/unstable", init);

    expect([first.status, concurrent.status]).toEqual([500, 500]);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ executions: 2 });
    expect(executions).toBe(2);
  });
});
