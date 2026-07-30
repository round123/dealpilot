import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { API_ERROR_CODES } from "../src/error.js";
import {
  createSupabaseApiAdapter,
  type PostgrestQueryLike,
} from "../src/supabase.js";

function queryResult(data: unknown) {
  const promise = Promise.resolve({ data, error: null, status: 200 });
  const query = Object.assign(promise, {
    abortSignal: vi.fn((_signal: AbortSignal) => query),
  });
  return query as PostgrestQueryLike;
}

describe("Supabase API adapter", () => {
  it("passes AbortSignal to PostgREST builders", async () => {
    const query = queryResult([{ id: 1 }]);
    const adapter = createSupabaseApiAdapter({} as never);
    const controller = new AbortController();

    await expect(
      adapter.postgrest(query, z.array(z.object({ id: z.number() })), {
        signal: controller.signal,
      }),
    ).resolves.toEqual([{ id: 1 }]);

    expect(query.abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it("creates and normalizes RPC requests", async () => {
    const rpc = vi.fn(() => queryResult({ data: { merged: true } }));
    const adapter = createSupabaseApiAdapter({ rpc, functions: {} } as never);

    await expect(
      adapter.rpc(
        "merge_customer",
        { source_id: "source", target_id: "target" },
        z.object({ merged: z.boolean() }),
      ),
    ).resolves.toEqual({ merged: true });

    expect(rpc).toHaveBeenCalledWith(
      "merge_customer",
      { source_id: "source", target_id: "target" },
      { head: undefined, get: undefined, count: undefined },
    );
  });

  it("passes AbortSignal to Edge Function invocations", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { data: { restored: true } },
      error: null,
    });
    const adapter = createSupabaseApiAdapter({
      functions: { invoke },
    } as never);
    const controller = new AbortController();

    await adapter.invoke(
      "restore-customer",
      z.object({ restored: z.boolean() }),
      {
        body: { customer_id: "customer" },
        signal: controller.signal,
      },
    );

    expect(invoke).toHaveBeenCalledWith("restore-customer", {
      body: { customer_id: "customer" },
      signal: controller.signal,
    });
  });

  it("normalizes cancellation to ABORTED", async () => {
    const adapter = createSupabaseApiAdapter({} as never);
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.postgrest(queryResult(null), z.null(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.aborted,
      status: 0,
      requestId: expect.stringMatching(/\S/),
    });
  });

  it("normalizes an AbortError thrown by the transport", async () => {
    const abortError = Object.assign(new Error("aborted by transport"), {
      name: "AbortError",
    });
    const failedQuery = Object.assign(Promise.reject(abortError), {
      abortSignal: vi.fn(),
    }) as unknown as PostgrestQueryLike;
    const adapter = createSupabaseApiAdapter({} as never);

    await expect(
      adapter.postgrest(failedQuery, z.unknown()),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.aborted,
      status: 0,
      requestId: expect.stringMatching(/\S/),
    });
  });

  it("normalizes transport failures to NETWORK_ERROR", async () => {
    const failedQuery = Object.assign(
      Promise.reject(new TypeError("offline")),
      {
        abortSignal: vi.fn(),
      },
    ) as unknown as PostgrestQueryLike;
    const adapter = createSupabaseApiAdapter({} as never);

    await expect(
      adapter.postgrest(failedQuery, z.unknown()),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.network,
      status: 0,
      requestId: expect.stringMatching(/\S/),
    });
  });
});
