import { ApiError } from "@dealpilot/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_TOKEN_STORAGE_KEY,
  agentVoidParser,
  captureAgentToken,
  createAgentClient,
} from "./client";

const objectParser = {
  parse(value: unknown) {
    if (!value || typeof value !== "object") throw new Error("invalid object");
    return value as Record<string, unknown>;
  },
};

describe("Agent client", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  beforeEach(() => {
    values.clear();
    values.set(AGENT_TOKEN_STORAGE_KEY, "agent-token");
  });

  it("captures the one-time URL token in session storage and removes it", () => {
    const replaceUrl = vi.fn();

    expect(
      captureAgentToken(
        "http://127.0.0.1:4174/?token=secret#/contacts",
        storage,
        replaceUrl,
      ),
    ).toBe("secret");
    expect(storage.getItem(AGENT_TOKEN_STORAGE_KEY)).toBe("secret");
    expect(replaceUrl).toHaveBeenCalledWith("/#/contacts");
  });

  it("adds bearer auth, query parameters, and idempotency headers", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createAgentClient({
      baseUrl: "http://127.0.0.1:31081",
      fetchImpl: fetchImpl as typeof fetch,
      storage,
    });

    await client.put("customers/1", { name: "Acme" }, objectParser, {
      query: { preview: true },
      idempotencyKey: "write-1",
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as Parameters<
      typeof fetch
    >;
    expect(String(url)).toBe(
      "http://127.0.0.1:31081/api/v1/customers/1?preview=true",
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer agent-token");
    expect(headers.get("idempotency-key")).toBe("write-1");
  });

  it("sends multipart bodies without overriding the browser content type", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ accepted: true }), { status: 200 }),
    );
    const client = createAgentClient({
      fetchImpl: fetchImpl as typeof fetch,
      storage,
    });
    const formData = new FormData();
    formData.set("file", new File(["name\nAcme"], "customers.csv"));

    await client.postForm("imports/parse", formData, objectParser, {
      idempotencyKey: "import-1",
    });

    const [, init] = fetchImpl.mock.calls[0] as unknown as Parameters<
      typeof fetch
    >;
    const headers = new Headers(init?.headers);
    expect(init?.body).toBe(formData);
    expect(headers.has("content-type")).toBe(false);
    expect(headers.get("idempotency-key")).toBe("import-1");
  });

  it("parses typed blob downloads and rejects unexpected content", async () => {
    const csvParser = {
      parse(value: unknown) {
        if (!(value instanceof Blob) || !value.type.includes("text/csv")) {
          throw new TypeError("not csv");
        }
        return value;
      },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("row,field,message", {
          headers: { "content-type": "text/csv" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("not a csv", {
          headers: { "content-type": "text/plain" },
        }),
      );
    const client = createAgentClient({
      fetchImpl: fetchImpl as typeof fetch,
      storage,
    });

    const csv = await client.getBlob("imports/job/errors", csvParser);
    expect(csv.type).toContain("text/csv");
    await expect(
      client.getBlob("imports/job/errors", csvParser),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("parses JSON success and 204 empty responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "1" })))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createAgentClient({
      fetchImpl: fetchImpl as typeof fetch,
      storage,
    });

    await expect(client.get("customers/1", objectParser)).resolves.toEqual({
      id: "1",
    });
    await expect(
      client.delete("customers/1", agentVoidParser),
    ).resolves.toBeUndefined();
  });

  it("normalizes Agent error envelopes and non-JSON errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "duplicate",
              fields: { name: ["already exists"] },
              request_id: "request-1",
            },
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
    const client = createAgentClient({
      fetchImpl: fetchImpl as typeof fetch,
      storage,
    });

    await expect(client.get("customers", objectParser)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "duplicate",
      fields: { name: ["already exists"] },
      requestId: "request-1",
      status: 409,
    });
    await expect(client.get("customers", objectParser)).rejects.toMatchObject({
      code: "SERVER_ERROR",
      status: 502,
    });
  });

  it("classifies non-envelope 400 responses as validation errors", async () => {
    const client = createAgentClient({
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false }), { status: 400 }),
      ) as typeof fetch,
      storage,
    });

    await expect(
      client.post("customers", {}, objectParser),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
  });

  it("rejects invalid 2xx responses", async () => {
    const client = createAgentClient({
      fetchImpl: vi.fn(async () => new Response("not-json")) as typeof fetch,
      storage,
    });

    await expect(client.get("customers", objectParser)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("normalizes network and cancellation failures", async () => {
    const networkClient = createAgentClient({
      fetchImpl: vi.fn(async () => {
        throw new TypeError("offline");
      }) as typeof fetch,
      storage,
    });
    await expect(
      networkClient.get("customers", objectParser),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });

    const controller = new AbortController();
    controller.abort();
    const abortClient = createAgentClient({
      fetchImpl: vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }) as typeof fetch,
      storage,
    });
    const result = abortClient.get("customers", objectParser, {
      signal: controller.signal,
    });
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ code: "ABORTED" });
  });
});
