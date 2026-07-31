import {
  API_ERROR_CODES,
  ApiError,
  CustomerSchema,
  CustomerSummarySchema,
} from "@dealpilot/api-client";
import { describe, expect, it, vi } from "vitest";

import {
  applyRaFilters,
  createApiDataProvider,
  type ApiDataClient,
} from "./apiDataProvider";

const records = [
  { id: "1", name: "Alpha", score: 2, stage: "won", tags: [1, 2] },
  { id: "2", name: "Beta", score: 5, stage: "open", tags: [2] },
  { id: "3", name: "Alpine", score: 8, stage: "lost", tags: [3] },
];

const createClient = (): ApiDataClient => ({
  list: vi.fn().mockResolvedValue({ data: records, total: records.length }),
  getOne: vi.fn().mockResolvedValue(records[0]),
  create: vi.fn().mockResolvedValue(records[0]),
  update: vi.fn().mockResolvedValue(records[0]),
  delete: vi.fn().mockResolvedValue(records[0]),
});

describe("API client React Admin adapter", () => {
  it("preserves Atomic CRM comparison, search, and contains filters", () => {
    expect(
      applyRaFilters(records, {
        "stage@neq": "lost",
        "score@gte": 5,
        "tags@cs": "{2}",
        "@or": { "name@ilike": "be" },
      }).map(({ id }) => id),
    ).toEqual(["2"]);
  });

  it("pushes the Customer query, filters, stable sort, pagination, and signal to the server", async () => {
    const client = createClient();
    const controller = new AbortController();
    vi.mocked(client.list).mockResolvedValue({
      data: [records[0]],
      total: 2_501,
    });
    const provider = createApiDataProvider(client);

    await expect(
      provider.getList("companies_summary", {
        filter: {
          q: "  Northwind  ",
          "deleted_at@is": null,
          grade: "A",
          status: "active",
        },
        sort: { field: "updated_at", order: "DESC" },
        pagination: { page: 3, perPage: 25 },
        signal: controller.signal,
      }),
    ).resolves.toEqual({ data: [records[0]], total: 2_501 });

    expect(client.list).toHaveBeenCalledTimes(1);
    expect(client.list).toHaveBeenCalledWith(
      "companies_summary",
      CustomerSummarySchema,
      {
        signal: controller.signal,
        filters: {
          search_text: { operator: "ilike", value: "%Northwind%" },
          deleted_at: { operator: "is", value: null },
          grade: { operator: "eq", value: "A" },
          status: { operator: "eq", value: "active" },
        },
        sort: [
          { field: "updated_at", order: "desc" },
          { field: "id", order: "asc" },
        ],
        pagination: { page: 3, perPage: 25 },
      },
    );
  });

  it("propagates strict Customer INVALID_RESPONSE failures", async () => {
    const client = createClient();
    const invalidResponse = new ApiError({
      code: API_ERROR_CODES.invalidResponse,
      message: "Customer summary contract drifted",
    });
    vi.mocked(client.list).mockRejectedValue(invalidResponse);
    const provider = createApiDataProvider(client);

    await expect(
      provider.getList("companies_summary", {
        filter: {},
        pagination: { page: 1, perPage: 25 },
        sort: { field: "name", order: "ASC" },
      }),
    ).rejects.toBe(invalidResponse);
    expect(client.list).toHaveBeenCalledTimes(1);
  });

  it("uses strict Customer schemas for summary reads and company writes", async () => {
    const client = createClient();
    const provider = createApiDataProvider(client);

    await provider.getOne("companies_summary", { id: "1" });
    await provider.create("companies", { data: records[0] });
    await provider.update("companies", {
      id: "1",
      data: { name: "Updated" },
      previousData: records[0],
    });
    await provider.delete("companies", {
      id: "1",
      previousData: records[0],
    });

    expect(client.getOne).toHaveBeenCalledWith(
      "companies_summary",
      "1",
      CustomerSummarySchema,
      { signal: undefined },
    );
    expect(client.create).toHaveBeenCalledWith(
      "companies",
      records[0],
      CustomerSchema,
      { signal: undefined },
    );
    expect(client.update).toHaveBeenCalledWith(
      "companies",
      "1",
      { name: "Updated" },
      CustomerSchema,
      { signal: undefined },
    );
    expect(client.delete).toHaveBeenCalledWith(
      "companies",
      "1",
      CustomerSchema,
      { signal: undefined },
    );
  });

  it("returns filtered, sorted, and paginated React Admin lists", async () => {
    const client = createClient();
    const provider = createApiDataProvider(client);

    await expect(
      provider.getList("contacts", {
        filter: { "name@ilike": "alp" },
        sort: { field: "score", order: "DESC" },
        pagination: { page: 1, perPage: 1 },
      }),
    ).resolves.toEqual({ data: [records[2]], total: 2 });
    expect(client.list).toHaveBeenCalledWith(
      "contacts",
      expect.anything(),
      expect.objectContaining({ pagination: { page: 1, perPage: 1000 } }),
    );
  });

  it("maps writes to the API client while keeping RA result envelopes", async () => {
    const client = createClient();
    const provider = createApiDataProvider(client);

    await expect(
      provider.update("contacts", {
        id: "1",
        data: { name: "Updated" },
        previousData: records[0],
      }),
    ).resolves.toEqual({ data: records[0] });
    expect(client.update).toHaveBeenCalledWith(
      "contacts",
      "1",
      { name: "Updated" },
      expect.anything(),
      { signal: undefined },
    );
  });

  it("normalizes cloud social account identities before create and update", async () => {
    const client = createClient();
    const provider = createApiDataProvider(client);

    await provider.create("social_accounts", {
      data: {
        company_id: "customer-1",
        platform: " WhatsApp ",
        raw_identifier: "  +8613800000000  ",
      },
    });
    await provider.update("social_accounts", {
      id: "social-1",
      data: {
        platform: "Telegram",
        raw_identifier: " @Buyer ",
      },
      previousData: { id: "social-1" },
    });

    expect(client.create).toHaveBeenCalledWith(
      "social_accounts",
      {
        company_id: "customer-1",
        platform: "whatsapp",
        raw_identifier: "+8613800000000",
        normalized_identifier: "+8613800000000",
      },
      expect.anything(),
      { signal: undefined },
    );
    expect(client.update).toHaveBeenCalledWith(
      "social_accounts",
      "social-1",
      {
        platform: "telegram",
        raw_identifier: "@Buyer",
        normalized_identifier: "@buyer",
      },
      expect.anything(),
      { signal: undefined },
    );
  });
});
