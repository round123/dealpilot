import { describe, expect, it, vi } from "vitest";
import {
  API_ERROR_CODES,
  ApiError,
  ContactIdSchema,
  CustomerIdSchema,
  CustomerMergeChoicesSchema,
  CustomerSchema,
  CustomerSummarySchema,
  DealIdSchema,
  FollowUpIdSchema,
  ReminderIdSchema,
  ResolvedCustomerMergeFieldsSchema,
  resolveCustomerMergeFields,
  SocialAccountIdSchema,
  UserIdSchema,
} from "../src/index.js";
import { parseData } from "../src/contracts.js";
import { createCustomerApi } from "../src/customer.js";
import type { ApiClient } from "../src/gateway.js";

const CUSTOMER_ID = "a0000000-0000-4000-8000-000000000001";
const SOURCE_ID = "a0000000-0000-4000-8000-000000000002";
const USER_ID = "b0000000-0000-4000-8000-000000000001";
const CONTACT_ID = "c0000000-0000-4000-8000-000000000001";
const SOCIAL_ID = "d0000000-0000-4000-8000-000000000001";
const DEAL_ID = "e0000000-0000-4000-8000-000000000001";
const FOLLOW_UP_ID = "f0000000-0000-4000-8000-000000000001";
const REMINDER_ID = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-07-30T08:00:00.000Z";

const customerRecord = {
  id: CUSTOMER_ID,
  owner_user_id: USER_ID,
  name: "Acme",
  company: "Acme Holdings",
  sector: null,
  size: null,
  linkedin_url: null,
  website: null,
  phone_number: null,
  address: null,
  zipcode: null,
  city: null,
  state_abbr: null,
  country: "CN",
  description: null,
  revenue: null,
  tax_identifier: null,
  logo: null,
  context_links: ["https://example.com/customer/acme"],
  source: "conference",
  grade: "B",
  status: "active",
  deleted_at: null,
  created_at: NOW,
  updated_at: NOW,
} as const;

const customerDetailRecord = {
  ...customerRecord,
  contacts: [
    {
      id: CONTACT_ID,
      owner_user_id: USER_ID,
      company_id: CUSTOMER_ID,
      first_name: "Ada",
      last_name: "Lovelace",
      name: "Ada Lovelace",
      gender: null,
      title: "CTO",
      background: null,
      avatar: null,
      first_seen: null,
      last_seen: NOW,
      has_newsletter: false,
      status: null,
      linkedin_url: null,
      email_jsonb: [{ email: "ada@example.com", type: "Work" }],
      phone_jsonb: [],
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  social_accounts: [
    {
      id: SOCIAL_ID,
      owner_user_id: USER_ID,
      company_id: CUSTOMER_ID,
      contact_id: CONTACT_ID,
      platform: "linkedin",
      raw_identifier: "ada",
      normalized_identifier: "ada",
      manually_bound: true,
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  deals: [
    {
      id: DEAL_ID,
      owner_user_id: USER_ID,
      company_id: CUSTOMER_ID,
      name: "Cloud migration",
      category: null,
      stage: "proposal",
      grade: "A",
      description: null,
      currency: "USD",
      amount: 1200,
      probability: 60,
      expected_closing_date: "2026-08-31",
      closed_reason: null,
      archived_at: null,
      sort_index: 1,
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  recent_follow_ups: [
    {
      id: FOLLOW_UP_ID,
      owner_user_id: USER_ID,
      company_id: CUSTOMER_ID,
      deal_id: DEAL_ID,
      type: "email",
      note: "Sent proposal",
      message_body: null,
      message_direction: null,
      occurred_at: NOW,
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  open_reminders: [
    {
      id: REMINDER_ID,
      owner_user_id: USER_ID,
      company_id: CUSTOMER_ID,
      deal_id: DEAL_ID,
      type: "waiting_reply",
      status: "pending",
      due_at: NOW,
      priority: "high",
      last_notified_at: null,
      snooze_until: null,
      resolution: null,
      deletion_event_id: null,
      created_at: NOW,
      updated_at: NOW,
    },
  ],
} as const;

const customerSummaryRecord = {
  ...customerRecord,
  sales_id: USER_ID,
  nb_contacts: 1,
  nb_deals: 1,
  search_text: "Acme Acme Holdings CN",
} as const;

const sourceCustomer = CustomerSchema.parse({
  ...customerRecord,
  id: SOURCE_ID,
  name: "Source Customer",
  company: null,
  country: null,
  source: null,
  grade: "A",
  status: "inactive",
});

const targetCustomer = CustomerSchema.parse({
  ...customerRecord,
  name: "Target Customer",
  company: "Target Holdings",
  country: "SG",
  source: "referral",
  grade: "C",
  status: "active",
});

const mergeFields = [
  "name",
  "company",
  "country",
  "source",
  "grade",
  "status",
] as const;

const createHarness = () => {
  const rpc = vi.fn();
  const api = createCustomerApi({ rpc } as unknown as Pick<ApiClient, "rpc">);
  return { api, rpc };
};

describe("Customer API facade", () => {
  it("requires name in the resolved merge field contract", () => {
    expect(() =>
      ResolvedCustomerMergeFieldsSchema.parse({
        company: null,
        country: null,
        source: null,
        grade: "A",
        status: "active",
      }),
    ).toThrow();
  });

  it("allows choices for only the six V1 merge fields", () => {
    expect(() =>
      CustomerMergeChoicesSchema.parse({ website: "source" }),
    ).toThrow();
  });

  it.each(mergeFields)("resolves %s from the source Customer", (field) => {
    const fields = resolveCustomerMergeFields(sourceCustomer, targetCustomer, {
      [field]: "source",
    });

    expect(fields[field]).toEqual(sourceCustomer[field]);
  });

  it.each(mergeFields)("resolves %s from the target Customer", (field) => {
    const fields = resolveCustomerMergeFields(sourceCustomer, targetCustomer, {
      [field]: "target",
    });

    expect(fields[field]).toEqual(targetCustomer[field]);
  });

  it("keeps every target value when a field choice is omitted", () => {
    expect(
      resolveCustomerMergeFields(sourceCustomer, targetCustomer, {}),
    ).toEqual({
      name: targetCustomer.name,
      company: targetCustomer.company,
      country: targetCustomer.country,
      source: targetCustomer.source,
      grade: targetCustomer.grade,
      status: targetCustomer.status,
    });
  });

  it("preserves nullable source values without converting them", () => {
    expect(
      resolveCustomerMergeFields(sourceCustomer, targetCustomer, {
        company: "source",
        country: "source",
        source: "source",
      }),
    ).toMatchObject({ company: null, country: null, source: null });
  });

  it("strictly parses the companies_summary resource contract", () => {
    const summary = parseData(CustomerSummarySchema, customerSummaryRecord);

    expect(summary).toMatchObject({
      id: CustomerIdSchema.parse(CUSTOMER_ID),
      sales_id: UserIdSchema.parse(USER_ID),
      nb_contacts: 1,
      nb_deals: 1,
      search_text: "Acme Acme Holdings CN",
    });
  });

  it("maps companies_summary schema drift to INVALID_RESPONSE", () => {
    expect(() =>
      parseData(CustomerSummarySchema, {
        ...customerSummaryRecord,
        nb_contacts: "1",
      }),
    ).toThrowError(
      expect.objectContaining<ApiError>({
        code: API_ERROR_CODES.invalidResponse,
      }),
    );
  });

  it("gets and strictly parses the aggregate Customer detail", async () => {
    const { api, rpc } = createHarness();
    const signal = new AbortController().signal;
    rpc.mockResolvedValue(customerDetailRecord);

    const detail = await api.getCustomerDetail(
      CustomerIdSchema.parse(CUSTOMER_ID),
      { signal },
    );

    expect(detail).toMatchObject({
      id: CustomerIdSchema.parse(CUSTOMER_ID),
      owner_user_id: UserIdSchema.parse(USER_ID),
      company: "Acme Holdings",
      context_links: ["https://example.com/customer/acme"],
      contacts: [{ id: ContactIdSchema.parse(CONTACT_ID) }],
      social_accounts: [{ id: SocialAccountIdSchema.parse(SOCIAL_ID) }],
      deals: [{ id: DealIdSchema.parse(DEAL_ID) }],
      recent_follow_ups: [{ id: FollowUpIdSchema.parse(FOLLOW_UP_ID) }],
      open_reminders: [{ id: ReminderIdSchema.parse(REMINDER_ID) }],
    });
    expect(rpc).toHaveBeenCalledWith(
      "get_customer_detail",
      { p_customer_id: CUSTOMER_ID },
      expect.anything(),
      { signal },
    );
  });

  it.each([
    ["softDeleteCustomer", "soft_delete_customer"],
    ["restoreCustomer", "restore_customer"],
  ] as const)("calls %s through its domain RPC", async (method, rpcName) => {
    const { api, rpc } = createHarness();
    rpc.mockResolvedValue(customerRecord);
    const customerId = CustomerIdSchema.parse(CUSTOMER_ID);

    await expect(api[method](customerId)).resolves.toMatchObject({
      id: customerId,
    });

    expect(rpc).toHaveBeenCalledWith(
      rpcName,
      { p_customer_id: CUSTOMER_ID },
      expect.anything(),
      undefined,
    );
  });

  it("merges Customers with typed resolved field values", async () => {
    const { api, rpc } = createHarness();
    rpc.mockResolvedValue({
      ...customerRecord,
      name: "Merged",
      company: "Merged Holdings",
      grade: "A",
      source: null,
    });

    const merged = await api.mergeCustomers({
      sourceId: CustomerIdSchema.parse(SOURCE_ID),
      targetId: CustomerIdSchema.parse(CUSTOMER_ID),
      fieldResolutions: {
        name: "Merged",
        company: "Merged Holdings",
        grade: "A",
        source: null,
      },
    });

    expect(merged).toMatchObject({
      name: "Merged",
      company: "Merged Holdings",
      context_links: ["https://example.com/customer/acme"],
      grade: "A",
      source: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      "merge_customers",
      {
        p_source_id: SOURCE_ID,
        p_target_id: CUSTOMER_ID,
        p_field_resolutions: {
          name: "Merged",
          company: "Merged Holdings",
          grade: "A",
          source: null,
        },
      },
      expect.anything(),
      undefined,
    );
  });

  it("maps a malformed successful RPC payload to INVALID_RESPONSE", async () => {
    const { api, rpc } = createHarness();
    rpc.mockResolvedValue({ ...customerRecord, grade: "VIP" });

    await expect(
      api.softDeleteCustomer(CustomerIdSchema.parse(CUSTOMER_ID)),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.invalidResponse,
    });
  });

  it("preserves normalized ApiError failures from the RPC boundary", async () => {
    const { api, rpc } = createHarness();
    const error = new ApiError({
      code: API_ERROR_CODES.notFound,
      message: "Active customer not found",
      status: 404,
    });
    rpc.mockRejectedValue(error);

    await expect(
      api.getCustomerDetail(CustomerIdSchema.parse(CUSTOMER_ID)),
    ).rejects.toBe(error);
  });

  it("passes cancellation through and preserves the normalized ABORTED error", async () => {
    const { api, rpc } = createHarness();
    const controller = new AbortController();
    const error = new ApiError({
      code: API_ERROR_CODES.aborted,
      message: "Request was aborted",
      status: 0,
    });
    rpc.mockRejectedValue(error);
    controller.abort();

    await expect(
      api.restoreCustomer(CustomerIdSchema.parse(CUSTOMER_ID), {
        signal: controller.signal,
      }),
    ).rejects.toBe(error);
    expect(rpc.mock.calls[0]?.[3]).toEqual({ signal: controller.signal });
  });
});
