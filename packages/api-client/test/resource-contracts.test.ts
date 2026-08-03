import { describe, expect, it } from "vitest";

import {
  CloudPrdResourceSchemas,
  LegacyAtomicRecordSchema,
  cloudRecordSchemaFor,
  isCloudPrdResource,
  toContactCreateInput,
  toContactUpdateInput,
  toDealCreateInput,
  toDealUpdateInput,
} from "../src/index.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "a0000000-0000-4000-8000-000000000001";
const CONTACT_ID = "c0000000-0000-4000-8000-000000000001";
const SOCIAL_ID = "d0000000-0000-4000-8000-000000000001";
const DEAL_ID = "e0000000-0000-4000-8000-000000000001";
const FOLLOW_UP_ID = "f0000000-0000-4000-8000-000000000001";
const REMINDER_ID = "10000000-0000-4000-8000-000000000001";
const RISK_ID = "90000000-0000-4000-8000-000000000001";
const MILESTONE_ID = "80000000-0000-4000-8000-000000000001";
const NOW = "2026-08-02T08:00:00.000Z";

const customer = {
  id: CUSTOMER_ID,
  owner_user_id: USER_ID,
  name: "Acme",
  company: null,
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
  context_links: [],
  source: null,
  grade: "A",
  status: "active",
  deleted_at: null,
  created_at: NOW,
  updated_at: NOW,
} as const;

const contact = {
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
  first_seen: NOW,
  last_seen: NOW,
  has_newsletter: false,
  status: "warm",
  linkedin_url: null,
  email_jsonb: [{ email: "ada@example.com", type: "Work" }],
  phone_jsonb: [],
  created_at: NOW,
  updated_at: NOW,
} as const;

const deal = {
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

const records = {
  companies: customer,
  companies_summary: {
    ...customer,
    sales_id: USER_ID,
    nb_contacts: 1,
    nb_deals: 1,
    search_text: "Acme CN",
  },
  contacts: contact,
  contacts_summary: {
    ...contact,
    sales_id: USER_ID,
    company_name: "Acme",
    tags: [],
    nb_tasks: 0,
    email_fts: "ada@example.com",
    phone_fts: "",
  },
  social_accounts: {
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
  deals: deal,
  follow_ups: {
    id: FOLLOW_UP_ID,
    owner_user_id: USER_ID,
    company_id: CUSTOMER_ID,
    deal_id: DEAL_ID,
    type: "email",
    note: "Proposal sent",
    message_body: null,
    message_direction: null,
    occurred_at: NOW,
    created_at: NOW,
    updated_at: NOW,
  },
  reminders: {
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
  deal_risks: {
    id: RISK_ID,
    owner_user_id: USER_ID,
    deal_id: DEAL_ID,
    description: "Approval delay",
    severity: "high",
    status: "open",
    handled_at: null,
    created_at: NOW,
    updated_at: NOW,
  },
  deal_milestones: {
    id: MILESTONE_ID,
    owner_user_id: USER_ID,
    deal_id: DEAL_ID,
    name: "Sign contract",
    due_date: "2026-09-01",
    completed: false,
    created_at: NOW,
    updated_at: NOW,
  },
} as const;

describe("Cloud PRD resource contracts", () => {
  it("projects Contact creates to real table columns and defaults JSONB arrays", () => {
    expect(
      toContactCreateInput({
        company_id: CUSTOMER_ID,
        first_name: "Ada",
        email_jsonb: null,
        phone_jsonb: null,
        sales_id: USER_ID,
        tags: ["70000000-0000-4000-8000-000000000001"],
        company_name: "Acme",
        nb_tasks: 3,
        email_fts: "ada@example.com",
        phone_fts: "13800000000",
        created_at: NOW,
        updated_at: NOW,
      }),
    ).toEqual({
      company_id: CUSTOMER_ID,
      first_name: "Ada",
      email_jsonb: [],
      phone_jsonb: [],
    });
  });

  it("projects Contact updates without injecting absent fields", () => {
    expect(
      toContactUpdateInput({
        title: "CTO",
        email_jsonb: null,
        sales_id: USER_ID,
        tags: [],
        company_name: "Acme",
        nb_tasks: 0,
      }),
    ).toEqual({ title: "CTO", email_jsonb: [] });
    expect(toContactUpdateInput({ tags: [] })).toEqual({});
    expect(() =>
      toContactUpdateInput({ email_jsonb: "ada@example.com" }),
    ).toThrow();
  });

  it("maps React Admin Deal fields to the PostgreSQL wire contract", () => {
    expect(
      toDealCreateInput({
        company_id: CUSTOMER_ID,
        name: "Cloud migration",
        index: 4,
        contact_ids: [CONTACT_ID],
        sales_id: USER_ID,
        owner_user_id: USER_ID,
        created_at: NOW,
      }),
    ).toEqual({
      company_id: CUSTOMER_ID,
      name: "Cloud migration",
      sort_index: 4,
    });

    expect(
      toDealUpdateInput({
        index: 0,
        contact_ids: [],
        sales_id: USER_ID,
        updated_at: NOW,
      }),
    ).toEqual({ sort_index: 0 });
  });

  it.each(Object.entries(records))(
    "strictly parses the %s wire record",
    (resource, record) => {
      const schema = cloudRecordSchemaFor(resource);

      expect(isCloudPrdResource(resource)).toBe(true);
      expect(schema).toBe(
        CloudPrdResourceSchemas[
          resource as keyof typeof CloudPrdResourceSchemas
        ],
      );
      expect(schema.parse(record)).toEqual(record);
    },
  );

  it.each(Object.entries(records))(
    "rejects missing fields and unknown fields for %s",
    (resource, record) => {
      const schema = cloudRecordSchemaFor(resource);
      const { updated_at: _updatedAt, ...missingUpdatedAt } = record;

      expect(schema.safeParse(missingUpdatedAt).success).toBe(false);
      expect(
        schema.safeParse({ ...record, unexpected_wire_field: true }).success,
      ).toBe(false);
    },
  );

  it("keeps non-PRD Atomic resources behind an explicit identity-only boundary", () => {
    expect(isCloudPrdResource("contact_notes")).toBe(false);
    expect(cloudRecordSchemaFor("contact_notes")).toBe(
      LegacyAtomicRecordSchema,
    );
    expect(
      LegacyAtomicRecordSchema.parse({ id: "note-1", legacy_field: true }),
    ).toEqual({ id: "note-1", legacy_field: true });
    expect(
      LegacyAtomicRecordSchema.safeParse({ legacy_field: true }).success,
    ).toBe(false);
  });
});
