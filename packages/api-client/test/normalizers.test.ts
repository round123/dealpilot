import { describe, expect, it } from "vitest";
import { z } from "zod";
import { API_ERROR_CODES } from "../src/error.js";
import {
  normalizeFunctionResponse,
  normalizePostgrestResponse,
  normalizeRpcResponse,
} from "../src/normalizers.js";

describe("Supabase response normalizers", () => {
  it("parses a successful PostgREST response", () => {
    const result = normalizePostgrestResponse(
      { data: [{ id: 1 }], error: null, status: 200 },
      z.array(z.object({ id: z.number().int() })),
    );

    expect(result).toEqual([{ id: 1 }]);
  });

  it("maps a 204 response to undefined without inventing a body", () => {
    expect(
      normalizePostgrestResponse(
        { data: null, error: null, status: 204 },
        z.undefined(),
      ),
    ).toBeUndefined();
  });

  it("rejects an unparseable 2xx response", () => {
    expect(() =>
      normalizePostgrestResponse(
        { data: { id: "wrong" }, error: null, status: 200 },
        z.object({ id: z.number() }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.invalidResponse,
        status: 200,
        requestId: expect.stringMatching(/\S/),
      }),
    );
  });

  it("maps PostgreSQL uniqueness errors to a stable conflict code", () => {
    expect(() =>
      normalizePostgrestResponse(
        {
          data: null,
          error: { code: "23505", message: "duplicate key" },
          status: 409,
        },
        z.unknown(),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.conflict,
        status: 409,
        requestId: expect.stringMatching(/\S/),
      }),
    );
  });

  it("preserves a native PostgREST request ID", () => {
    expect(() =>
      normalizePostgrestResponse(
        {
          data: null,
          error: {
            code: "23505",
            message: "duplicate key",
            request_id: "req-postgrest",
          },
          status: 409,
        },
        z.unknown(),
      ),
    ).toThrowError(expect.objectContaining({ requestId: "req-postgrest" }));
  });

  it("unwraps an RPC success envelope before parsing", () => {
    expect(
      normalizeRpcResponse(
        { data: { data: { merged: true } }, error: null, status: 200 },
        z.object({ merged: z.boolean() }),
      ),
    ).toEqual({ merged: true });
  });

  it("rejects an RPC 2xx response without the success envelope", () => {
    expect(() =>
      normalizeRpcResponse(
        { data: { merged: true }, error: null, status: 200 },
        z.object({ merged: z.boolean() }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.invalidResponse,
        status: 200,
        requestId: expect.stringMatching(/\S/),
      }),
    );
  });

  it("keeps PostgREST error normalization for RPC failures", () => {
    expect(() =>
      normalizeRpcResponse(
        {
          data: null,
          error: { code: "42501", message: "row-level security violation" },
          status: 403,
        },
        z.unknown(),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: API_ERROR_CODES.forbidden,
        status: 403,
        requestId: expect.stringMatching(/\S/),
      }),
    );
  });

  it("preserves a native RPC request ID", () => {
    expect(() =>
      normalizeRpcResponse(
        {
          data: null,
          error: {
            code: "42501",
            message: "row-level security violation",
            request_id: "req-rpc",
          },
          status: 403,
        },
        z.unknown(),
      ),
    ).toThrowError(expect.objectContaining({ requestId: "req-rpc" }));
  });

  it("unwraps and parses a successful Edge Function envelope", async () => {
    await expect(
      normalizeFunctionResponse(
        { data: { data: { merged: true } }, error: null },
        z.object({ merged: z.boolean() }),
      ),
    ).resolves.toEqual({ merged: true });
  });

  it("normalizes a structured Edge Function error response", async () => {
    const context = new Response(
      JSON.stringify({
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: "Customer not found",
          request_id: "req-edge",
        },
      }),
      {
        status: 404,
        headers: { "content-type": "application/json" },
      },
    );

    await expect(
      normalizeFunctionResponse(
        {
          data: null,
          error: { message: "Function returned an error", context },
        },
        z.unknown(),
      ),
    ).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
      status: 404,
      requestId: "req-edge",
    });
  });

  it("prefers an Edge error body request ID over the response header", async () => {
    const context = new Response(
      JSON.stringify({
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: "Customer not found",
          request_id: "req-body",
        },
      }),
      {
        status: 404,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-header",
        },
      },
    );

    await expect(
      normalizeFunctionResponse(
        {
          data: null,
          error: { message: "Function returned an error", context },
        },
        z.unknown(),
      ),
    ).rejects.toMatchObject({ requestId: "req-body" });
  });

  it("uses the response header when a structured Edge error omits request_id", async () => {
    const context = new Response(
      JSON.stringify({
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: "Customer not found",
        },
      }),
      {
        status: 404,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-header",
        },
      },
    );

    await expect(
      normalizeFunctionResponse(
        {
          data: null,
          error: { message: "Function returned an error", context },
        },
        z.unknown(),
      ),
    ).rejects.toMatchObject({ requestId: "req-header" });
  });

  it("normalizes a non-JSON Edge Function error response", async () => {
    const context = new Response("Bad gateway", {
      status: 502,
      headers: { "x-request-id": "req-proxy" },
    });

    await expect(
      normalizeFunctionResponse(
        { data: null, error: { message: "Function failed", context } },
        z.unknown(),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.server,
      status: 502,
      requestId: "req-proxy",
    });
  });

  it("generates a request ID for a non-JSON Edge error without a header", async () => {
    const context = new Response("Bad gateway", { status: 502 });

    await expect(
      normalizeFunctionResponse(
        { data: null, error: { message: "Function failed", context } },
        z.unknown(),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.server,
      status: 502,
      requestId: expect.stringMatching(/\S/),
    });
  });
});
