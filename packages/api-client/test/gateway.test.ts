import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { createApiClient } from "../src/gateway.js";

function createQuery(response: {
  data: unknown;
  error: null;
  status: number;
  count?: number;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  let executions = 0;
  const query = {
    calls,
    get executions() {
      return executions;
    },
    select(...args: unknown[]) {
      calls.push(["select", ...args]);
      return query;
    },
    insert(...args: unknown[]) {
      calls.push(["insert", ...args]);
      return query;
    },
    update(...args: unknown[]) {
      calls.push(["update", ...args]);
      return query;
    },
    delete(...args: unknown[]) {
      calls.push(["delete", ...args]);
      return query;
    },
    eq(...args: unknown[]) {
      calls.push(["eq", ...args]);
      return query;
    },
    neq(...args: unknown[]) {
      calls.push(["neq", ...args]);
      return query;
    },
    in(...args: unknown[]) {
      calls.push(["in", ...args]);
      return query;
    },
    is(...args: unknown[]) {
      calls.push(["is", ...args]);
      return query;
    },
    lt(...args: unknown[]) {
      calls.push(["lt", ...args]);
      return query;
    },
    lte(...args: unknown[]) {
      calls.push(["lte", ...args]);
      return query;
    },
    gt(...args: unknown[]) {
      calls.push(["gt", ...args]);
      return query;
    },
    gte(...args: unknown[]) {
      calls.push(["gte", ...args]);
      return query;
    },
    ilike(...args: unknown[]) {
      calls.push(["ilike", ...args]);
      return query;
    },
    contains(...args: unknown[]) {
      calls.push(["contains", ...args]);
      return query;
    },
    order(...args: unknown[]) {
      calls.push(["order", ...args]);
      return query;
    },
    range(...args: unknown[]) {
      calls.push(["range", ...args]);
      return query;
    },
    single(...args: unknown[]) {
      calls.push(["single", ...args]);
      return query;
    },
    abortSignal(...args: unknown[]) {
      calls.push(["abortSignal", ...args]);
      return query;
    },
    then<TResult1 = typeof response, TResult2 = never>(
      onfulfilled?:
        ((value: typeof response) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      executions += 1;
      return Promise.resolve(response).then(onfulfilled, onrejected);
    },
  };
  return query;
}

describe("public API gateway", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
  });

  it("does not expose a self-service account deletion API", () => {
    mocks.createClient.mockReturnValue({ from: vi.fn(), functions: {} });

    const api = createApiClient({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });

    expect(api).not.toHaveProperty("account");
  });

  it("constructs list queries inside the package and returns React Admin-shaped metadata", async () => {
    const query = createQuery({
      data: [{ id: "550e8400-e29b-41d4-a716-446655440000", name: "Acme" }],
      error: null,
      status: 200,
      count: 12,
    });
    const from = vi.fn(() => query);
    mocks.createClient.mockReturnValue({ from, functions: {} });
    const api = createApiClient({
      url: "https://example.supabase.co/",
      anonKey: "anon-key",
    });
    const signal = new AbortController().signal;

    await expect(
      api.list(
        "customers",
        z.object({ id: z.string().uuid(), name: z.string() }),
        {
          filters: {
            status: "active",
            tag_id: ["one", "two"],
            deleted_at: null,
          },
          sort: { field: "name", order: "asc" },
          pagination: { page: 2, perPage: 10 },
          signal,
        },
      ),
    ).resolves.toEqual({
      data: [{ id: "550e8400-e29b-41d4-a716-446655440000", name: "Acme" }],
      total: 12,
    });

    expect(from).toHaveBeenCalledWith("customers");
    expect(query.calls).toEqual([
      ["select", "*", { count: "exact" }],
      ["eq", "status", "active"],
      ["in", "tag_id", ["one", "two"]],
      ["is", "deleted_at", null],
      ["order", "name", { ascending: true }],
      ["range", 10, 19],
      ["abortSignal", signal],
    ]);
    expect(query.executions).toBe(1);
  });

  it("constructs create mutations and parses their response", async () => {
    const query = createQuery({
      data: { id: "550e8400-e29b-41d4-a716-446655440000", name: "Acme" },
      error: null,
      status: 201,
    });
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => query),
      functions: {},
    });
    const api = createApiClient({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });

    await expect(
      api.create(
        "customers",
        { name: "Acme" },
        z.object({ id: z.string().uuid(), name: z.string() }),
      ),
    ).resolves.toMatchObject({ name: "Acme" });

    expect(query.calls).toEqual([
      ["insert", { name: "Acme" }],
      ["select", "*"],
      ["single"],
    ]);
  });

  it("maps every structured filter to its Supabase query builder method", async () => {
    const query = createQuery({
      data: [],
      error: null,
      status: 200,
      count: 0,
    });
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => query),
      functions: {},
    });
    const api = createApiClient({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    const signal = new AbortController().signal;

    await api.list("companies", z.object({ id: z.string() }), {
      filters: {
        status: { operator: "eq", value: "active" },
        grade: { operator: "neq", value: "C" },
        deleted_at: { operator: "is", value: null },
        created_at: { operator: "lt", value: "2026-08-01T00:00:00Z" },
        updated_at: { operator: "lte", value: "2026-08-02T00:00:00Z" },
        amount: { operator: "gt", value: 100 },
        probability: { operator: "gte", value: 50 },
        name: { operator: "ilike", value: "%acme%" },
        country: { operator: "in", value: ["CN", "SG"] },
        context_links: {
          operator: "contains",
          value: ["https://example.com/acme"],
        },
      },
      sort: [
        { field: "created_at", order: "desc" },
        { field: "id", order: "asc" },
      ],
      pagination: { page: 3, perPage: 20 },
      signal,
    });

    expect(query.calls).toEqual([
      ["select", "*", { count: "exact" }],
      ["eq", "status", "active"],
      ["neq", "grade", "C"],
      ["is", "deleted_at", null],
      ["lt", "created_at", "2026-08-01T00:00:00Z"],
      ["lte", "updated_at", "2026-08-02T00:00:00Z"],
      ["gt", "amount", 100],
      ["gte", "probability", 50],
      ["ilike", "name", "%acme%"],
      ["in", "country", ["CN", "SG"]],
      ["contains", "context_links", ["https://example.com/acme"]],
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: true }],
      ["range", 40, 59],
      ["abortSignal", signal],
    ]);
  });

  it("supports owner_user_id as the identity field for configuration resources", async () => {
    const response = {
      data: {
        owner_user_id: "550e8400-e29b-41d4-a716-446655440000",
        locale: "zh-CN",
      },
      error: null,
      status: 200,
    };
    const getQuery = createQuery(response);
    const updateQuery = createQuery(response);
    const deleteQuery = createQuery(response);
    const from = vi
      .fn()
      .mockReturnValueOnce(getQuery)
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(deleteQuery);
    mocks.createClient.mockReturnValue({ from, functions: {} });
    const api = createApiClient({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    const schema = z.object({
      owner_user_id: z.string().uuid(),
      locale: z.string(),
    });
    const ownerId = "550e8400-e29b-41d4-a716-446655440000";

    await api.getOne("configuration", ownerId, schema, {
      idField: "owner_user_id",
    });
    await api.update("configuration", ownerId, { locale: "zh-CN" }, schema, {
      idField: "owner_user_id",
    });
    await api.delete("configuration", ownerId, schema, {
      idField: "owner_user_id",
    });

    expect(getQuery.calls).toEqual([
      ["select", "*"],
      ["eq", "owner_user_id", ownerId],
      ["single"],
    ]);
    expect(updateQuery.calls).toEqual([
      ["update", { locale: "zh-CN" }],
      ["eq", "owner_user_id", ownerId],
      ["select", "*"],
      ["single"],
    ]);
    expect(deleteQuery.calls).toEqual([
      ["delete"],
      ["eq", "owner_user_id", ownerId],
      ["select", "*"],
      ["single"],
    ]);
  });

  it("uses id as the identity field by default", async () => {
    const query = createQuery({
      data: { id: "record-id" },
      error: null,
      status: 200,
    });
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => query),
      functions: {},
    });
    const api = createApiClient({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });

    await api.getOne("customers", "record-id", z.object({ id: z.string() }));

    expect(query.calls).toContainEqual(["eq", "id", "record-id"]);
  });

  it("deletes association rows by structured filters and parses every row", async () => {
    const contactId = "c0000000-0000-4000-8000-000000000001";
    const tagId = "70000000-0000-4000-8000-000000000001";
    const query = createQuery({
      data: [{ contact_id: contactId, tag_id: tagId }],
      error: null,
      status: 200,
    });
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => query),
      functions: {},
    });
    const api = createApiClient({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
    const signal = new AbortController().signal;

    await expect(
      api.deleteWhere(
        "contact_tags",
        {
          contact_id: { operator: "eq", value: contactId },
          tag_id: { operator: "in", value: [tagId] },
        },
        z.object({ contact_id: z.string().uuid(), tag_id: z.string().uuid() }),
        { signal },
      ),
    ).resolves.toEqual([{ contact_id: contactId, tag_id: tagId }]);

    expect(query.calls).toEqual([
      ["delete"],
      ["eq", "contact_id", contactId],
      ["in", "tag_id", [tagId]],
      ["select", "*"],
      ["abortSignal", signal],
    ]);
  });

  it("rejects an unscoped filtered delete before constructing a query", async () => {
    const from = vi.fn();
    mocks.createClient.mockReturnValue({ from, functions: {} });
    const api = createApiClient({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });

    expect(() =>
      api.deleteWhere("contact_tags", {}, z.object({ tag_id: z.string() })),
    ).toThrowError(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        fields: { filters: ["At least one filter is required"] },
      }),
    );
    expect(from).not.toHaveBeenCalled();
  });
});
