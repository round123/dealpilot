import {
  API_ERROR_CODES,
  type Customer,
  type CustomerSummary,
} from "@dealpilot/api-client";
import type { DataProvider, RaRecord } from "ra-core";

import type { Db } from "./fakerest/dataGenerator/types";
import { createDataProvider } from "./fakerest/dataProvider";
import { createLocalCustomerOperations } from "./localCustomerOperations";
import type {
  Company,
  Contact,
  Deal,
  FollowUp,
  Reminder,
  SocialAccount,
} from "../types";

const NOW = "2026-07-30T08:00:00.000Z";
const LATER = "2026-08-02T08:00:00.000Z";

const buildDb = (): Db => ({
  companies: [
    company(1, "Source Customer", "China", "A"),
    company(2, "Target Customer", "Canada", "B"),
    company(3, "Other Customer", "France", "C"),
  ],
  contacts: [contact(10, 1, "Alice"), contact(20, 2, "Bob")],
  contact_notes: [],
  social_accounts: [
    {
      id: 90,
      owner_user_id: 0,
      company_id: 1,
      contact_id: 10,
      platform: "whatsapp",
      raw_identifier: "+8613800000000",
      normalized_identifier: "+8613800000000",
      manually_bound: true,
      created_at: NOW,
      updated_at: NOW,
    },
  ],
  follow_ups: [followUp(100, 1, 30)],
  deals: [deal(30, 1, "Source Deal"), deal(40, 2, "Target Deal")],
  deal_notes: [],
  tasks: [],
  reminders: [reminder(50, 1, 30, "pending"), reminder(51, 1, 30, "completed")],
  deal_risks: [],
  deal_milestones: [],
  sales: [
    {
      id: 0,
      user_id: "local-user",
      first_name: "Local",
      last_name: "User",
      email: "local@example.com",
      administrator: true,
      disabled: false,
    },
  ],
  tags: [],
  configuration: [
    { id: 1, config: {} as Db["configuration"][number]["config"] },
  ],
});

const setup = () => {
  const dataProvider = createDataProvider({
    db: buildDb(),
    latency: 0,
    silent: true,
  });
  return {
    dataProvider,
    operations: createLocalCustomerOperations(dataProvider),
  };
};

describe("local Customer operations", () => {
  it("builds the five-part detail from the dedicated domain resources", async () => {
    const { operations } = setup();

    const detail = await operations.getCustomerDetail(customerId(1));

    expect(detail.name).toBe("Source Customer");
    expect(detail.contacts).toHaveLength(1);
    expect(detail.social_accounts).toHaveLength(1);
    expect(detail.deals.map((item) => item.name)).toEqual(["Source Deal"]);
    expect(detail.recent_follow_ups.map((item) => item.note)).toEqual([
      "Called purchasing manager",
    ]);
    expect(detail.open_reminders).toHaveLength(1);

    const candidates = await operations.listMergeCandidates({
      sourceId: customerId(1),
      search: "target",
      page: 1,
      perPage: 10,
    });
    expect(candidates.total).toBe(1);
    expect(candidates.data[0]).toMatchObject({
      id: customerId(2),
      name: "Target Customer",
      nb_contacts: 1,
      nb_deals: 1,
    });
  });

  it("restores deletion-linked reminders after recreating the operations adapter", async () => {
    const { dataProvider, operations } = setup();

    const deleted = await operations.softDeleteCustomer(customerId(1));
    expect(deleted.deleted_at).not.toBeNull();
    await expect(
      operations.listMergeCandidates({
        sourceId: customerId(2),
        search: "source",
        page: 1,
        perPage: 10,
      }),
    ).resolves.toMatchObject({ data: [], total: 0 });
    const remindersAfterDelete = await allReminders(dataProvider);
    expect(remindersAfterDelete.find((item) => item.id === 50)).toMatchObject({
      status: "ignored",
      deletion_previous_status: "pending",
    });
    expect(remindersAfterDelete.find((item) => item.id === 51)?.status).toBe(
      "completed",
    );

    const recreatedOperations = createLocalCustomerOperations(dataProvider);
    const restored = await recreatedOperations.restoreCustomer(customerId(1));

    expect(restored.deleted_at).toBeNull();
    const remindersAfterRestore = await allReminders(dataProvider);
    expect(remindersAfterRestore.find((item) => item.id === 50)).toMatchObject({
      status: "pending",
      deletion_event_id: null,
      deletion_previous_status: null,
    });
    expect(remindersAfterRestore.find((item) => item.id === 51)?.status).toBe(
      "completed",
    );
  });

  it("does not restore a reminder changed after customer deletion", async () => {
    const { dataProvider, operations } = setup();
    const deleted = await operations.softDeleteCustomer(customerId(1));
    const changedReminder = (await allReminders(dataProvider)).find(
      (item) => item.id === 50,
    )!;
    await dataProvider.update("reminders", {
      id: changedReminder.id,
      data: { status: "completed", updated_at: LATER },
      previousData: changedReminder,
    });

    await createLocalCustomerOperations(dataProvider).restoreCustomer(
      customerId(1),
    );

    expect(deleted.deleted_at).not.toBe(LATER);
    expect(
      (await allReminders(dataProvider)).find((item) => item.id === 50)?.status,
    ).toBe("completed");
  });

  it("merges relations, applies selected fields, and soft-deletes the source", async () => {
    const { dataProvider, operations } = setup();
    const source = await operations.getCustomerDetail(customerId(1));
    const target = toSummary(await operations.getCustomerDetail(customerId(2)));

    const merged = await operations.mergeCustomers(source, target, {
      name: "source",
      company: "target",
      country: "source",
      source: "target",
      grade: "source",
      status: "target",
    });

    expect(merged).toMatchObject({
      id: customerId(2),
      name: "Source Customer",
      country: "China",
      grade: "A",
    });
    const sourceAfterMerge = await operations.getCustomerDetail(customerId(1));
    expect(sourceAfterMerge.deleted_at).not.toBeNull();
    const contacts = await listAll<Contact>(dataProvider, "contacts");
    const deals = await listAll<Deal>(dataProvider, "deals");
    const socialAccounts = await listAll<SocialAccount>(
      dataProvider,
      "social_accounts",
    );
    const followUps = await listAll<FollowUp>(dataProvider, "follow_ups");
    const reminders = await allReminders(dataProvider);
    expect(contacts.find((item) => item.id === 10)?.company_id).toBe(2);
    expect(deals.find((item) => item.id === 30)?.company_id).toBe(2);
    expect(socialAccounts.find((item) => item.id === 90)?.company_id).toBe(2);
    expect(followUps.find((item) => item.id === 100)?.company_id).toBe(2);
    expect(reminders.find((item) => item.id === 50)?.company_id).toBe(2);
  });

  it("normalizes cancellation into ApiError", async () => {
    const { operations } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(
      operations.getCustomerDetail(customerId(1), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.aborted });
  });
});

const company = (
  id: number,
  name: string,
  country: string,
  grade: Company["grade"],
): Company =>
  ({
    id,
    name,
    company: `${name} Ltd`,
    logo: { src: "", title: name },
    sector: "industrials",
    size: 10,
    linkedin_url: "",
    website: "",
    phone_number: "",
    address: "",
    zipcode: "",
    city: "",
    state_abbr: "",
    country,
    sales_id: 0,
    created_at: NOW,
    updated_at: NOW,
    description: "",
    revenue: "",
    tax_identifier: "",
    source: "Referral",
    grade,
    status: "active",
    deleted_at: null,
    context_links: [],
    nb_contacts: 1,
    nb_deals: id === 3 ? 0 : 1,
  }) as unknown as Company;

const contact = (
  id: number,
  companyId: number,
  firstName: string,
): Contact => ({
  id,
  first_name: firstName,
  last_name: "Buyer",
  title: "Buyer",
  company_id: companyId,
  company_name: companyId === 1 ? "Source Customer" : "Target Customer",
  email_jsonb: [],
  phone_jsonb: [],
  first_seen: NOW,
  last_seen: NOW,
  has_newsletter: false,
  tags: [],
  gender: "unknown",
  sales_id: 0,
  status: "warm",
  background: "",
  nb_tasks: companyId === 1 ? 2 : 0,
});

const deal = (id: number, companyId: number, name: string): Deal => ({
  id,
  name,
  company_id: companyId,
  contact_ids: [],
  category: "other",
  stage: "lead",
  description: "",
  amount: 100,
  created_at: NOW,
  updated_at: NOW,
  expected_closing_date: "2026-08-30",
  sales_id: 0,
  index: 0,
});

const followUp = (id: number, companyId: number, dealId: number): FollowUp => ({
  id,
  owner_user_id: 0,
  company_id: companyId,
  deal_id: dealId,
  type: "call",
  note: "Called purchasing manager",
  message_body: null,
  message_direction: null,
  occurred_at: NOW,
  created_at: NOW,
  updated_at: NOW,
});

const reminder = (
  id: number,
  companyId: number,
  dealId: number,
  status: Reminder["status"],
): Reminder => ({
  id,
  owner_user_id: 0,
  company_id: companyId,
  deal_id: dealId,
  type: "fixed_time",
  status,
  due_at: LATER,
  priority: "normal",
  last_notified_at: null,
  snooze_until: null,
  resolution: "Follow up",
  deletion_event_id: null,
  created_at: NOW,
  updated_at: NOW,
});

const customerId = (id: number) => String(id) as Customer["id"];

const allReminders = (dataProvider: DataProvider) =>
  listAll<Reminder & { deletion_previous_status?: Reminder["status"] | null }>(
    dataProvider,
    "reminders",
  );

const listAll = async <RecordType extends RaRecord>(
  dataProvider: DataProvider,
  resource: string,
) =>
  (
    await dataProvider.getList<RecordType>(resource, {
      filter: {},
      pagination: { page: 1, perPage: 100 },
      sort: { field: "id", order: "ASC" },
    })
  ).data;

const toSummary = (customer: Customer): CustomerSummary =>
  ({
    ...customer,
    sales_id: customer.owner_user_id,
    nb_contacts: 1,
    nb_deals: 1,
    search_text: customer.name,
  }) as CustomerSummary;
