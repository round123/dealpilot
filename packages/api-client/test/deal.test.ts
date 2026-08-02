import { describe, expect, it, vi } from "vitest";

import {
  API_ERROR_CODES,
  ContactIdSchema,
  DealIdSchema,
  createDealApi,
  type ApiClient,
} from "../src/index.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const CONTACT_A = "44444444-4444-4444-8444-444444444444";
const CONTACT_B = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-08-02T08:00:00.000Z";

const dealRecord = {
  id: DEAL_ID,
  owner_user_id: OWNER_ID,
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
  sort_index: 2,
  created_at: NOW,
  updated_at: NOW,
} as const;

const createHarness = () => {
  const rpc = vi.fn();
  const api = createDealApi({ rpc } as unknown as Pick<ApiClient, "rpc">);
  return { api, rpc };
};

describe("Deal API facade", () => {
  it("maps a projected patch, contacts, concurrency token, and cancellation", async () => {
    const { api, rpc } = createHarness();
    const signal = new AbortController().signal;
    rpc.mockResolvedValue({ ...dealRecord, contact_ids: [CONTACT_A] });

    await expect(
      api.updateWithContacts(
        {
          dealId: DealIdSchema.parse(DEAL_ID),
          patch: { name: "Cloud migration v2", sort_index: 4 },
          contactIds: [ContactIdSchema.parse(CONTACT_A)],
          expectedUpdatedAt: NOW,
        },
        { signal },
      ),
    ).resolves.toEqual({
      deal: dealRecord,
      contactIds: [ContactIdSchema.parse(CONTACT_A)],
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_deal_with_contacts",
      {
        p_deal_id: DEAL_ID,
        p_patch: { name: "Cloud migration v2", sort_index: 4 },
        p_contact_ids: [CONTACT_A],
        p_expected_updated_at: NOW,
      },
      expect.anything(),
      { signal },
    );
  });

  it("maps an omitted contact list and concurrency token to NULL", async () => {
    const { api, rpc } = createHarness();
    rpc.mockResolvedValue({ ...dealRecord, contact_ids: [CONTACT_A] });

    await api.updateWithContacts({
      dealId: DealIdSchema.parse(DEAL_ID),
      patch: { probability: 75 },
    });

    expect(rpc.mock.calls[0]?.[1]).toEqual({
      p_deal_id: DEAL_ID,
      p_patch: { probability: 75 },
      p_contact_ids: null,
      p_expected_updated_at: null,
    });
  });

  it("preserves an empty contact list so the RPC can clear all links", async () => {
    const { api, rpc } = createHarness();
    rpc.mockResolvedValue({ ...dealRecord, contact_ids: [] });

    await expect(
      api.updateWithContacts({
        dealId: DealIdSchema.parse(DEAL_ID),
        patch: {},
        contactIds: [],
      }),
    ).resolves.toEqual({ deal: dealRecord, contactIds: [] });

    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_contact_ids: [] });
  });

  it("allows repeated request IDs and trusts the normalized server result", async () => {
    const { api, rpc } = createHarness();
    rpc.mockResolvedValue({
      ...dealRecord,
      contact_ids: [CONTACT_A, CONTACT_B],
    });

    await expect(
      api.updateWithContacts({
        dealId: DealIdSchema.parse(DEAL_ID),
        patch: {},
        contactIds: [
          ContactIdSchema.parse(CONTACT_A),
          ContactIdSchema.parse(CONTACT_A),
          ContactIdSchema.parse(CONTACT_B),
        ],
      }),
    ).resolves.toMatchObject({
      contactIds: [CONTACT_A, CONTACT_B],
    });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_contact_ids: [CONTACT_A, CONTACT_A, CONTACT_B],
    });
  });

  it("normalizes invalid command input to a validation ApiError", async () => {
    const { api, rpc } = createHarness();

    await expect(
      api.updateWithContacts({
        dealId: "not-a-deal-id" as never,
        patch: {},
        expectedUpdatedAt: "not-a-date",
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.validation,
      fields: expect.objectContaining({
        dealId: expect.any(Array),
        expectedUpdatedAt: expect.any(Array),
      }),
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { ...dealRecord },
    { ...dealRecord, contact_ids: ["not-a-uuid"] },
    { ...dealRecord, contact_ids: [CONTACT_A, CONTACT_A] },
    { ...dealRecord, contact_ids: [], unexpected: true },
  ])("rejects a malformed successful RPC payload", async (payload) => {
    const { api, rpc } = createHarness();
    rpc.mockResolvedValue(payload);

    await expect(
      api.updateWithContacts({
        dealId: DealIdSchema.parse(DEAL_ID),
        patch: { name: "Updated" },
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.invalidResponse });
  });
});
