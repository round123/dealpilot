import {
  API_ERROR_CODES,
  ApiError,
  CloudPrdResourceSchemas,
  ContactSummarySchema,
  ContactTagSchema,
  CustomerContactSchema,
  CustomerSchema,
  CustomerSummarySchema,
  LegacyAtomicRecordSchema,
} from "@dealpilot/api-client";
import { describe, expect, it, vi } from "vitest";

import {
  applyRaFilters,
  createApiDataProvider,
  type ApiDataClient,
} from "./apiDataProvider";

const records = [
  { id: "1", name: "Alpha", score: 2, stage: "closed_won", tags: [1, 2] },
  { id: "2", name: "Beta", score: 5, stage: "open", tags: [2] },
  { id: "3", name: "Alpine", score: 8, stage: "closed_lost", tags: [3] },
];

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const DEAL_ID = "55555555-5555-4555-8555-555555555555";
const CONTACT_A = "66666666-6666-4666-8666-666666666666";
const CONTACT_B = "77777777-7777-4777-8777-777777777777";
const CONTACT_C = "88888888-8888-4888-8888-888888888888";
const NOW = "2026-08-02T08:00:00.000Z";

const customerWritePayload = {
  name: "Acme China",
  company: "Acme Holdings",
  sector: "Software",
  size: 120,
  linkedin_url: "https://linkedin.com/company/acme",
  website: "https://acme.example",
  phone_number: "+86 21 5555 0100",
  address: "100 Cloud Road",
  zipcode: "200000",
  city: "Shanghai",
  state_abbr: "SH",
  country: "CN",
  description: "Enterprise account",
  revenue: "CNY 10M",
  tax_identifier: "91310000TEST",
  logo: null,
  context_links: ["https://acme.example/context"],
  source: "referral",
  grade: "A",
  status: "active",
} as const;

const customerSummaryRecord = {
  id: CUSTOMER_ID,
  owner_user_id: USER_ID,
  ...customerWritePayload,
  deleted_at: null,
  created_at: NOW,
  updated_at: NOW,
  sales_id: USER_ID,
  nb_contacts: 12,
  nb_deals: 3,
  search_text: "Acme China Acme Holdings CN",
} as const;

const wireDeal = {
  id: DEAL_ID,
  owner_user_id: USER_ID,
  company_id: CUSTOMER_ID,
  name: "Cloud migration",
  category: null,
  stage: "proposal",
  grade: "A",
  description: null,
  currency: "CNY",
  amount: 12_000,
  probability: 70,
  expected_closing_date: "2026-09-30",
  closed_reason: null,
  archived_at: null,
  sort_index: 1,
  created_at: NOW,
  updated_at: NOW,
} as const;

const dealContact = (contactId: string) => ({
  owner_user_id: USER_ID,
  deal_id: DEAL_ID,
  contact_id: contactId,
  created_at: NOW,
});

const createClient = (): ApiDataClient => ({
  reminders: {
    updateStatus: vi.fn().mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      owner_user_id: "11111111-1111-4111-8111-111111111111",
      company_id: "22222222-2222-4222-8222-222222222222",
      deal_id: null,
      type: "waiting_reply",
      status: "completed",
      due_at: "2026-08-02T08:00:00.000Z",
      priority: "normal",
      last_notified_at: null,
      snooze_until: null,
      resolution: "completed",
      deletion_event_id: null,
      created_at: "2026-08-02T08:00:00.000Z",
      updated_at: "2026-08-02T08:01:00.000Z",
    }),
  },
  customers: {
    listCustomers: vi.fn().mockResolvedValue({
      items: records,
      next_cursor: null,
      total: records.length,
    }),
  },
  list: vi.fn().mockResolvedValue({ data: records, total: records.length }),
  getOne: vi.fn().mockResolvedValue(records[0]),
  create: vi.fn().mockResolvedValue(records[0]),
  update: vi.fn().mockResolvedValue(records[0]),
  delete: vi.fn().mockResolvedValue(records[0]),
  deleteWhere: vi.fn().mockResolvedValue([]),
});

describe("API client React Admin adapter", () => {
  it.each(Object.entries(CloudPrdResourceSchemas))(
    "selects the strict %s schema at the generic API boundary",
    async (resource, schema) => {
      const client = createClient();
      const provider = createApiDataProvider(client);

      await provider.getOne(resource, { id: "wire-record-id" });

      expect(client.getOne).toHaveBeenCalledWith(
        resource,
        "wire-record-id",
        schema,
        { signal: undefined },
      );
    },
  );

  it("uses the explicit identity-only compatibility schema for non-PRD Atomic resources", async () => {
    const client = createClient();
    const provider = createApiDataProvider(client);

    await provider.getOne("contact_notes", { id: "legacy-note-id" });

    expect(client.getOne).toHaveBeenCalledWith(
      "contact_notes",
      "legacy-note-id",
      LegacyAtomicRecordSchema,
      { signal: undefined },
    );
  });

  it("preserves Atomic CRM comparison, search, and contains filters", () => {
    expect(
      applyRaFilters(records, {
        "stage@neq": "closed_lost",
        "score@gte": 5,
        "tags@cs": "{2}",
        "@or": { "name@ilike": "be" },
      }).map(({ id }) => id),
    ).toEqual(["2"]);
  });

  it("pushes the Customer query, filters, stable sort, pagination, and signal to the server", async () => {
    const client = createClient();
    const controller = new AbortController();
    vi.mocked(client.customers.listCustomers).mockResolvedValue({
      items: [records[0] as never],
      next_cursor: "opaque-next-page",
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
    ).resolves.toEqual({
      data: [records[0]],
      total: 2_501,
      pageInfo: { hasNextPage: true, hasPreviousPage: true },
    });

    expect(client.customers.listCustomers).toHaveBeenCalledTimes(3);
    expect(client.customers.listCustomers).toHaveBeenLastCalledWith(
      {
        cursor: "opaque-next-page",
        limit: 25,
        search: "Northwind",
        grade: "A",
        status: "active",
        sortField: "updated_at",
        sortOrder: "desc",
      },
      { signal: controller.signal },
    );
  });

  it("passes the previous opaque cursor when the user advances a page", async () => {
    const client = createClient();
    vi.mocked(client.customers.listCustomers)
      .mockResolvedValueOnce({
        items: [records[0] as never],
        next_cursor: "cursor-for-page-2",
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [records[1] as never],
        next_cursor: null,
        total: 2,
      });
    const provider = createApiDataProvider(client);
    const base = {
      filter: {},
      sort: { field: "name", order: "ASC" as const },
      pagination: { page: 1, perPage: 1 },
    };

    await provider.getList("companies_summary", base);
    await expect(
      provider.getList("companies_summary", {
        ...base,
        pagination: { page: 2, perPage: 1 },
      }),
    ).resolves.toMatchObject({
      data: [records[1]],
      pageInfo: { hasNextPage: false, hasPreviousPage: true },
    });
    await provider.getList("companies_summary", base);

    expect(client.customers.listCustomers).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "cursor-for-page-2" }),
      { signal: undefined },
    );
    expect(client.customers.listCustomers).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ cursor: null }),
      { signal: undefined },
    );
  });

  it("rebuilds the cursor chain after a Customer mutation", async () => {
    const client = createClient();
    vi.mocked(client.customers.listCustomers)
      .mockReset()
      .mockResolvedValueOnce({
        items: [records[0] as never],
        next_cursor: "stale-page-2",
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [records[1] as never],
        next_cursor: null,
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [records[0] as never],
        next_cursor: "fresh-page-2",
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [records[1] as never],
        next_cursor: null,
        total: 2,
      });
    const provider = createApiDataProvider(client);
    const firstPage = {
      filter: {},
      sort: { field: "name", order: "ASC" as const },
      pagination: { page: 1, perPage: 1 },
    };
    const secondPage = {
      ...firstPage,
      pagination: { page: 2, perPage: 1 },
    };

    await provider.getList("companies_summary", firstPage);
    await provider.getList("companies_summary", secondPage);
    await provider.update("companies", {
      id: "1",
      data: { name: "Changed" },
      previousData: records[0],
    });
    await provider.getList("companies_summary", secondPage);

    expect(client.customers.listCustomers).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ cursor: null }),
      { signal: undefined },
    );
    expect(client.customers.listCustomers).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ cursor: "fresh-page-2" }),
      { signal: undefined },
    );
  });

  it("propagates strict Customer INVALID_RESPONSE failures", async () => {
    const client = createClient();
    const invalidResponse = new ApiError({
      code: API_ERROR_CODES.invalidResponse,
      message: "Customer summary contract drifted",
    });
    vi.mocked(client.customers.listCustomers).mockRejectedValue(
      invalidResponse,
    );
    const provider = createApiDataProvider(client);

    await expect(
      provider.getList("companies_summary", {
        filter: {},
        pagination: { page: 1, perPage: 25 },
        sort: { field: "name", order: "ASC" },
      }),
    ).rejects.toBe(invalidResponse);
    expect(client.customers.listCustomers).toHaveBeenCalledTimes(1);
  });

  it("projects Customer summary records to writable company fields", async () => {
    const client = createClient();
    const provider = createApiDataProvider(client);

    await provider.getOne("companies_summary", { id: CUSTOMER_ID });
    await provider.create("companies", { data: customerSummaryRecord });
    await provider.update("companies", {
      id: CUSTOMER_ID,
      data: customerSummaryRecord,
      previousData: customerSummaryRecord,
    });
    await provider.updateMany("companies", {
      ids: [CUSTOMER_ID, "33333333-3333-4333-8333-333333333333"],
      data: customerSummaryRecord,
    });
    await provider.delete("companies", {
      id: CUSTOMER_ID,
      previousData: customerSummaryRecord,
    });

    expect(client.getOne).toHaveBeenCalledWith(
      "companies_summary",
      CUSTOMER_ID,
      CustomerSummarySchema,
      { signal: undefined },
    );
    expect(client.create).toHaveBeenCalledWith(
      "companies",
      customerWritePayload,
      CustomerSchema,
      { signal: undefined },
    );
    expect(client.update).toHaveBeenNthCalledWith(
      1,
      "companies",
      CUSTOMER_ID,
      customerWritePayload,
      CustomerSchema,
      { signal: undefined },
    );
    expect(client.update).toHaveBeenNthCalledWith(
      2,
      "companies",
      CUSTOMER_ID,
      customerWritePayload,
      CustomerSchema,
      { signal: undefined },
    );
    expect(client.update).toHaveBeenNthCalledWith(
      3,
      "companies",
      "33333333-3333-4333-8333-333333333333",
      customerWritePayload,
      CustomerSchema,
      { signal: undefined },
    );
    expect(client.delete).toHaveBeenCalledWith(
      "companies",
      CUSTOMER_ID,
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
      CustomerContactSchema,
      { signal: undefined },
    );
    expect(client.getOne).toHaveBeenCalledWith(
      "contacts_summary",
      "1",
      ContactSummarySchema,
      { signal: undefined },
    );
  });

  it("maps Deal list and detail reads to index, sales_id, and contact_ids", async () => {
    const client = createClient();
    vi.mocked(client.list).mockImplementation(
      async (resource) =>
        (resource === "deals"
          ? { data: [wireDeal], total: 1 }
          : {
              data: [dealContact(CONTACT_A), dealContact(CONTACT_B)],
              total: 2,
            }) as never,
    );
    vi.mocked(client.getOne).mockResolvedValue(wireDeal as never);
    const provider = createApiDataProvider(client);

    await expect(
      provider.getList("deals", {
        filter: {},
        sort: { field: "index", order: "ASC" },
        pagination: { page: 1, perPage: 25 },
      }),
    ).resolves.toMatchObject({
      data: [
        {
          id: DEAL_ID,
          index: 1,
          sales_id: USER_ID,
          contact_ids: [CONTACT_A, CONTACT_B],
        },
      ],
    });
    await expect(
      provider.getOne("deals", { id: DEAL_ID }),
    ).resolves.toMatchObject({
      data: {
        id: DEAL_ID,
        index: 1,
        sales_id: USER_ID,
        contact_ids: [CONTACT_A, CONTACT_B],
      },
    });

    expect(client.list).toHaveBeenCalledWith(
      "deal_contacts",
      expect.anything(),
      expect.objectContaining({
        filters: { deal_id: { operator: "eq", value: DEAL_ID } },
      }),
    );
  });

  it("creates a Deal with only real columns and writes every contact relation", async () => {
    const client = createClient();
    vi.mocked(client.create).mockImplementation(
      async (resource, input) =>
        (resource === "deals"
          ? wireDeal
          : dealContact(
              String((input as { contact_id: string }).contact_id),
            )) as never,
    );
    const provider = createApiDataProvider(client);

    await expect(
      provider.create("deals", {
        data: {
          company_id: CUSTOMER_ID,
          name: "Cloud migration",
          stage: "proposal",
          grade: "A",
          currency: "CNY",
          amount: 12_000,
          probability: 70,
          expected_closing_date: "2026-09-30",
          index: 1,
          contact_ids: [CONTACT_A, CONTACT_B],
          sales_id: USER_ID,
        },
      }),
    ).resolves.toMatchObject({
      data: {
        id: DEAL_ID,
        index: 1,
        sales_id: USER_ID,
        contact_ids: [CONTACT_A, CONTACT_B],
      },
    });

    expect(client.create).toHaveBeenNthCalledWith(
      1,
      "deals",
      {
        company_id: CUSTOMER_ID,
        name: "Cloud migration",
        stage: "proposal",
        grade: "A",
        currency: "CNY",
        amount: 12_000,
        probability: 70,
        expected_closing_date: "2026-09-30",
        sort_index: 1,
      },
      expect.anything(),
      { signal: undefined },
    );
    expect(client.create).toHaveBeenCalledWith(
      "deal_contacts",
      { deal_id: DEAL_ID, contact_id: CONTACT_A },
      expect.anything(),
      { signal: undefined },
    );
    expect(client.create).toHaveBeenCalledWith(
      "deal_contacts",
      { deal_id: DEAL_ID, contact_id: CONTACT_B },
      expect.anything(),
      { signal: undefined },
    );
  });

  it("updates Deal columns and synchronizes additions and removals", async () => {
    const client = createClient();
    vi.mocked(client.getOne).mockResolvedValue(wireDeal as never);
    vi.mocked(client.list).mockResolvedValue({
      data: [dealContact(CONTACT_A), dealContact(CONTACT_B)],
      total: 2,
    } as never);
    vi.mocked(client.update).mockResolvedValue({
      ...wireDeal,
      sort_index: 3,
    } as never);
    vi.mocked(client.create).mockResolvedValue(dealContact(CONTACT_C) as never);
    const provider = createApiDataProvider(client);

    await expect(
      provider.update("deals", {
        id: DEAL_ID,
        data: {
          index: 3,
          contact_ids: [CONTACT_B, CONTACT_C],
          sales_id: USER_ID,
        },
        previousData: {
          ...wireDeal,
          index: 1,
          contact_ids: [CONTACT_A, CONTACT_B],
          sales_id: USER_ID,
        },
      }),
    ).resolves.toMatchObject({
      data: { index: 3, contact_ids: [CONTACT_B, CONTACT_C] },
    });

    expect(client.update).toHaveBeenCalledWith(
      "deals",
      DEAL_ID,
      { sort_index: 3 },
      expect.anything(),
      { signal: undefined },
    );
    expect(client.create).toHaveBeenCalledWith(
      "deal_contacts",
      { deal_id: DEAL_ID, contact_id: CONTACT_C },
      expect.anything(),
      { signal: undefined },
    );
    expect(client.deleteWhere).toHaveBeenCalledWith(
      "deal_contacts",
      {
        deal_id: { operator: "eq", value: DEAL_ID },
        contact_id: { operator: "in", value: [CONTACT_A] },
      },
      expect.anything(),
      { signal: undefined },
    );
  });

  it("deletes a newly created Deal when a contact relation fails", async () => {
    const client = createClient();
    const relationError = new ApiError({
      code: API_ERROR_CODES.conflict,
      message: "Contact relation rejected",
    });
    vi.mocked(client.create)
      .mockResolvedValueOnce(wireDeal as never)
      .mockResolvedValueOnce(dealContact(CONTACT_A) as never)
      .mockRejectedValueOnce(relationError);
    vi.mocked(client.delete).mockResolvedValue(wireDeal as never);
    const provider = createApiDataProvider(client);

    await expect(
      provider.create("deals", {
        data: {
          company_id: CUSTOMER_ID,
          name: "Cloud migration",
          contact_ids: [CONTACT_A, CONTACT_B],
        },
      }),
    ).rejects.toBe(relationError);

    expect(client.delete).toHaveBeenCalledWith(
      "deals",
      DEAL_ID,
      expect.anything(),
    );
  });

  it("restores Deal fields and removes successful additions after relation failure", async () => {
    const client = createClient();
    const relationError = new ApiError({
      code: API_ERROR_CODES.conflict,
      message: "Contact relation rejected",
    });
    vi.mocked(client.getOne).mockResolvedValue(wireDeal as never);
    vi.mocked(client.list).mockResolvedValue({
      data: [dealContact(CONTACT_A)],
      total: 1,
    } as never);
    vi.mocked(client.update).mockResolvedValue({
      ...wireDeal,
      sort_index: 4,
    } as never);
    vi.mocked(client.create)
      .mockResolvedValueOnce(dealContact(CONTACT_B) as never)
      .mockRejectedValueOnce(relationError);
    const provider = createApiDataProvider(client);

    await expect(
      provider.update("deals", {
        id: DEAL_ID,
        data: { index: 4, contact_ids: [CONTACT_A, CONTACT_B, CONTACT_C] },
        previousData: {
          ...wireDeal,
          index: 1,
          contact_ids: [CONTACT_A],
          sales_id: USER_ID,
        },
      }),
    ).rejects.toBe(relationError);

    expect(client.update).toHaveBeenNthCalledWith(
      2,
      "deals",
      DEAL_ID,
      expect.objectContaining({
        company_id: CUSTOMER_ID,
        name: "Cloud migration",
        sort_index: 1,
      }),
      expect.anything(),
    );
    expect(client.deleteWhere).toHaveBeenCalledWith(
      "deal_contacts",
      {
        deal_id: { operator: "eq", value: DEAL_ID },
        contact_id: { operator: "in", value: [CONTACT_B] },
      },
      expect.anything(),
      { signal: undefined },
    );
  });

  it("writes only real Contact columns, defaults JSONB arrays, and creates tag links", async () => {
    const client = createClient();
    const contactId = "c0000000-0000-4000-8000-000000000001";
    const companyId = "a0000000-0000-4000-8000-000000000001";
    const tagId = "70000000-0000-4000-8000-000000000001";
    vi.mocked(client.create).mockImplementation(async (resource) =>
      resource === "contacts" ? ({ id: contactId } as never) : ({} as never),
    );
    vi.mocked(client.list).mockResolvedValue({ data: [], total: 0 });
    vi.mocked(client.getOne).mockResolvedValue({ id: contactId } as never);
    const provider = createApiDataProvider(client);

    await provider.create("contacts", {
      data: {
        company_id: companyId,
        first_name: "Ada",
        last_name: "Lovelace",
        email_jsonb: null,
        phone_jsonb: null,
        sales_id: "b0000000-0000-4000-8000-000000000001",
        tags: [tagId],
        company_name: "Acme",
        nb_tasks: 2,
        email_fts: "ada@example.com",
        phone_fts: "13800000000",
      },
    });

    expect(client.create).toHaveBeenNthCalledWith(
      1,
      "contacts",
      {
        company_id: companyId,
        first_name: "Ada",
        last_name: "Lovelace",
        email_jsonb: [],
        phone_jsonb: [],
      },
      CustomerContactSchema,
      { signal: undefined },
    );
    expect(client.create).toHaveBeenNthCalledWith(
      2,
      "contact_tags",
      { contact_id: contactId, tag_id: tagId },
      ContactTagSchema,
      { signal: undefined },
    );
    expect(client.getOne).toHaveBeenCalledWith(
      "contacts_summary",
      contactId,
      ContactSummarySchema,
      { signal: undefined },
    );
  });

  it("updates Contact table columns and synchronizes contact_tags by difference", async () => {
    const client = createClient();
    const contactId = "c0000000-0000-4000-8000-000000000001";
    const removedTagId = "70000000-0000-4000-8000-000000000001";
    const retainedTagId = "70000000-0000-4000-8000-000000000002";
    const addedTagId = "70000000-0000-4000-8000-000000000003";
    vi.mocked(client.list).mockResolvedValue({
      data: [{ tag_id: removedTagId }, { tag_id: retainedTagId }] as never,
      total: 2,
    });
    vi.mocked(client.getOne).mockResolvedValue({ id: contactId } as never);
    const provider = createApiDataProvider(client);

    await provider.update("contacts", {
      id: contactId,
      data: {
        title: "CTO",
        email_jsonb: null,
        phone_jsonb: [{ number: "+8613800000000", type: "Work" }],
        tags: [retainedTagId, addedTagId],
        sales_id: "b0000000-0000-4000-8000-000000000001",
        company_name: "Acme",
        nb_tasks: 4,
        email_fts: "",
        phone_fts: "+8613800000000",
      },
      previousData: { id: contactId },
    });

    expect(client.update).toHaveBeenCalledWith(
      "contacts",
      contactId,
      {
        title: "CTO",
        email_jsonb: [],
        phone_jsonb: [{ number: "+8613800000000", type: "Work" }],
      },
      CustomerContactSchema,
      { signal: undefined },
    );
    expect(client.deleteWhere).toHaveBeenCalledWith(
      "contact_tags",
      {
        contact_id: { operator: "eq", value: contactId },
        tag_id: { operator: "in", value: [removedTagId] },
      },
      ContactTagSchema,
      { signal: undefined },
    );
    expect(client.create).toHaveBeenCalledWith(
      "contact_tags",
      { contact_id: contactId, tag_id: addedTagId },
      ContactTagSchema,
      { signal: undefined },
    );
    expect(client.getOne).toHaveBeenCalledWith(
      "contacts_summary",
      contactId,
      ContactSummarySchema,
      { signal: undefined },
    );
  });

  it("handles a tag-only Contact edit without sending an empty table update", async () => {
    const client = createClient();
    const contactId = "c0000000-0000-4000-8000-000000000001";
    vi.mocked(client.list).mockResolvedValue({ data: [], total: 0 });
    vi.mocked(client.getOne).mockResolvedValue({ id: contactId } as never);
    const provider = createApiDataProvider(client);

    await provider.update("contacts", {
      id: contactId,
      data: { tags: [] },
      previousData: { id: contactId },
    });

    expect(client.update).not.toHaveBeenCalled();
    expect(client.list).toHaveBeenCalledWith(
      "contact_tags",
      ContactTagSchema,
      expect.objectContaining({
        filters: { contact_id: { operator: "eq", value: contactId } },
      }),
    );
  });

  it("deletes a newly created Contact when tag association fails", async () => {
    const client = createClient();
    const contactId = "c0000000-0000-4000-8000-000000000001";
    const companyId = "a0000000-0000-4000-8000-000000000001";
    const tagId = "70000000-0000-4000-8000-000000000001";
    const associationError = new ApiError({
      code: API_ERROR_CODES.aborted,
      message: "Tag association was aborted",
    });
    const controller = new AbortController();
    controller.abort();
    vi.mocked(client.create).mockImplementation(async (resource) => {
      if (resource === "contacts") return { id: contactId } as never;
      throw associationError;
    });
    vi.mocked(client.list).mockResolvedValue({ data: [], total: 0 });
    const provider = createApiDataProvider(client);

    await expect(
      provider.create("contacts", {
        data: {
          company_id: companyId,
          first_name: "Ada",
          email_jsonb: [],
          phone_jsonb: [],
          tags: [tagId],
        },
        signal: controller.signal,
        // React Admin adds this signal at runtime when abort support is enabled.
      } as never),
    ).rejects.toBe(associationError);

    expect(client.delete).toHaveBeenCalledWith(
      "contacts",
      contactId,
      CustomerContactSchema,
    );
    expect(client.getOne).not.toHaveBeenCalled();
  });

  it("rolls back tag links added before a later association fails", async () => {
    const client = createClient();
    const contactId = "c0000000-0000-4000-8000-000000000001";
    const firstTagId = "70000000-0000-4000-8000-000000000001";
    const failingTagId = "70000000-0000-4000-8000-000000000002";
    const associationError = new ApiError({
      code: API_ERROR_CODES.aborted,
      message: "Second association was aborted",
    });
    const controller = new AbortController();
    controller.abort();
    vi.mocked(client.list).mockResolvedValue({ data: [], total: 0 });
    vi.mocked(client.create)
      .mockResolvedValueOnce({ tag_id: firstTagId } as never)
      .mockRejectedValueOnce(associationError);
    const provider = createApiDataProvider(client);

    await expect(
      provider.update("contacts", {
        id: contactId,
        data: { tags: [firstTagId, failingTagId] },
        previousData: { id: contactId, tags: [] },
        signal: controller.signal,
      } as never),
    ).rejects.toBe(associationError);

    expect(client.deleteWhere).toHaveBeenCalledWith(
      "contact_tags",
      {
        contact_id: { operator: "eq", value: contactId },
        tag_id: { operator: "in", value: [firstTagId] },
      },
      ContactTagSchema,
    );
    expect(client.update).not.toHaveBeenCalled();
  });

  it("converges on retry when deleting stale tag links initially fails", async () => {
    const client = createClient();
    const contactId = "c0000000-0000-4000-8000-000000000001";
    const staleTagId = "70000000-0000-4000-8000-000000000001";
    const desiredTagId = "70000000-0000-4000-8000-000000000002";
    const deletionError = new ApiError({
      code: API_ERROR_CODES.server,
      message: "Delete failed",
    });
    vi.mocked(client.list)
      .mockResolvedValueOnce({
        data: [{ tag_id: staleTagId }] as never,
        total: 1,
      })
      .mockResolvedValueOnce({
        data: [{ tag_id: staleTagId }, { tag_id: desiredTagId }] as never,
        total: 2,
      });
    vi.mocked(client.deleteWhere)
      .mockRejectedValueOnce(deletionError)
      .mockResolvedValueOnce([]);
    vi.mocked(client.getOne).mockResolvedValue({ id: contactId } as never);
    const provider = createApiDataProvider(client);
    const params = {
      id: contactId,
      data: { tags: [desiredTagId] },
      previousData: { id: contactId, tags: [staleTagId] },
    };

    await expect(provider.update("contacts", params)).rejects.toBe(
      deletionError,
    );
    await expect(provider.update("contacts", params)).resolves.toEqual({
      data: { id: contactId },
    });

    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.create).toHaveBeenCalledWith(
      "contact_tags",
      { contact_id: contactId, tag_id: desiredTagId },
      ContactTagSchema,
      { signal: undefined },
    );
    expect(client.deleteWhere).toHaveBeenCalledTimes(2);
  });

  it("routes reminder status changes through the idempotent Reminder facade", async () => {
    const client = createClient();
    const provider = createApiDataProvider(client);
    const reminderId = "33333333-3333-4333-8333-333333333333";
    const idempotencyKey = "44444444-4444-4444-8444-444444444444";

    const params = {
      id: reminderId,
      data: { status: "completed", resolution: "completed" },
      previousData: { id: reminderId },
      meta: { idempotencyKey },
    };
    await expect(provider.update("reminders", params)).resolves.toMatchObject({
      data: { id: reminderId, status: "completed" },
    });
    await expect(provider.update("reminders", params)).resolves.toMatchObject({
      data: { id: reminderId, status: "completed" },
    });

    expect(client.reminders.updateStatus).toHaveBeenCalledWith(
      {
        reminderId,
        idempotencyKey,
        status: "completed",
        resolution: "completed",
      },
      { signal: undefined },
    );
    expect(client.reminders.updateStatus).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(client.reminders.updateStatus)
        .mock.calls.map(([command]) => command.idempotencyKey),
    ).toEqual([idempotencyKey, idempotencyKey]);
    expect(client.update).not.toHaveBeenCalled();
  });

  it("keeps ordinary reminder edits on the non-status resource path", async () => {
    const client = createClient();
    const provider = createApiDataProvider(client);
    const reminderId = "33333333-3333-4333-8333-333333333333";

    await provider.update("reminders", {
      id: reminderId,
      data: { priority: "urgent", due_at: "2026-08-04T08:00:00.000Z" },
      previousData: { id: reminderId },
    });

    expect(client.update).toHaveBeenCalledWith(
      "reminders",
      reminderId,
      { priority: "urgent", due_at: "2026-08-04T08:00:00.000Z" },
      expect.anything(),
      { signal: undefined },
    );
    expect(client.reminders.updateStatus).not.toHaveBeenCalled();
  });

  it("rejects reminder bulk status writes because there is no stable bulk command", async () => {
    const client = createClient();
    const provider = createApiDataProvider(client);

    await expect(
      provider.updateMany("reminders", {
        ids: [
          "33333333-3333-4333-8333-333333333333",
          "44444444-4444-4444-8444-444444444444",
        ],
        data: { status: "ignored", resolution: "ignored" },
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.validation });
    expect(client.reminders.updateStatus).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
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
