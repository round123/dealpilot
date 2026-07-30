import { describe, expect, it } from "vitest";
import {
  CustomerCreateSchema as V1CustomerCreateSchema,
  CustomerDetailSchema as V1CustomerDetailSchema,
  CustomerListQuerySchema as V1CustomerListQuerySchema,
  CustomerMergeSchema as V1CustomerMergeSchema,
  CustomerSchema as V1CustomerSchema,
  CustomerUpdateSchema as V1CustomerUpdateSchema,
} from "@dealpilot/shared";
import {
  CustomerDetailSchema as V2CustomerDetailSchema,
  CustomerMergeChoicesSchema,
  CustomerSchema as V2CustomerSchema,
  CustomerSummarySchema,
  resolveCustomerMergeFields,
} from "../src/index.js";
import {
  CUSTOMER_BEHAVIOR_FIXTURE,
  CUSTOMER_BEHAVIOR_IDS,
  CUSTOMER_BEHAVIOR_TIMES,
} from "./fixtures/customer-behavior.js";

const customerFields = ({
  name,
  company,
  country,
  source,
  grade,
  status,
}: {
  name: string;
  company: string | null;
  country: string | null;
  source: string | null;
  grade: "A" | "B" | "C";
  status: "active" | "inactive";
}) => ({ name, company, country, source, grade, status });

// These adapters only align V1/V2 response names; they do not implement detail selection.
const summarizeV1Detail = (
  detail: ReturnType<typeof V1CustomerDetailSchema.parse>,
) => ({
  contactIds: detail.contacts?.map(({ id }) => id) ?? [],
  socialAccountIds: detail.social_accounts?.map(({ id }) => id) ?? [],
  projectOrDealIds: detail.projects?.map(({ id }) => id) ?? [],
  recentFollowUpIds: detail.recent_follow_ups?.map(({ id }) => id) ?? [],
  openReminderIds: detail.open_reminders?.map(({ id }) => id) ?? [],
});

const summarizeV2Detail = (
  detail: ReturnType<typeof V2CustomerDetailSchema.parse>,
) => ({
  contactIds: detail.contacts.map(({ id }) => id),
  socialAccountIds: detail.social_accounts.map(({ id }) => id),
  projectOrDealIds: detail.deals.map(({ id }) => id),
  recentFollowUpIds: detail.recent_follow_ups.map(({ id }) => id),
  openReminderIds: detail.open_reminders.map(({ id }) => id),
});

describe("V1/V2 Customer fixed behavior baseline", () => {
  it("keeps one deterministic active list, search set, and pagination order", () => {
    const { customers } = CUSTOMER_BEHAVIOR_FIXTURE.seed;
    const { list } = CUSTOMER_BEHAVIOR_FIXTURE;
    const customersById = new Map(
      customers.map((customer) => [customer.id, customer]),
    );

    expect(V1CustomerListQuerySchema.parse(list.defaultQuery)).toMatchObject({
      limit: 2,
      sort: "created_at",
    });
    for (const scenario of list.searches) {
      expect(V1CustomerListQuerySchema.parse(scenario.query).search).toBe(
        scenario.query.search,
      );
    }
    expect(V1CustomerListQuerySchema.parse(list.filter.query)).toMatchObject({
      grade: "A",
      status: "active",
    });

    expect(list.pages.flat()).toEqual(list.orderedIds);
    expect(
      list.pages.every((page) => page.length <= list.defaultQuery.limit),
    ).toBe(true);
    expect(list.orderedIds).not.toContain(CUSTOMER_BEHAVIOR_IDS.deleted);
    for (const id of list.orderedIds) {
      expect(customersById.get(id)?.deleted_at).toBeNull();
    }
    for (const scenario of list.searches) {
      for (const id of scenario.expectedIds) {
        expect(customersById.has(id)).toBe(true);
      }
      expect(scenario.expectedIds).not.toContain(CUSTOMER_BEHAVIOR_IDS.deleted);
    }

    for (const customer of customers.filter(
      ({ deleted_at }) => deleted_at === null,
    )) {
      expect(V1CustomerSchema.parse(customer).id).toBe(customer.id);
      expect(
        CustomerSummarySchema.parse({
          ...customer,
          sales_id: customer.owner_user_id,
          nb_contacts: customer.id === CUSTOMER_BEHAVIOR_IDS.alpha ? 1 : 0,
          nb_deals: customer.id === CUSTOMER_BEHAVIOR_IDS.alpha ? 1 : 0,
          search_text: [customer.name, customer.company, customer.country]
            .filter(Boolean)
            .join(" "),
        }).id,
      ).toBe(customer.id);
    }
  });

  it("locks the V1 create defaults and the comparable V2 result", () => {
    const { create } = CUSTOMER_BEHAVIOR_FIXTURE;
    const v1Input = V1CustomerCreateSchema.parse(create.input);
    const v2Result = V2CustomerSchema.parse(create.expectedCustomer);

    expect({ grade: v1Input.grade, status: v1Input.status }).toEqual(
      create.expectedDefaults,
    );
    expect({ grade: v2Result.grade, status: v2Result.status }).toEqual(
      create.expectedDefaults,
    );
  });

  it("compares all five Customer detail association summaries", () => {
    const v1Detail = V1CustomerDetailSchema.parse(
      CUSTOMER_BEHAVIOR_FIXTURE.v1DetailResponse,
    );
    const v2Detail = V2CustomerDetailSchema.parse(
      CUSTOMER_BEHAVIOR_FIXTURE.v2DetailResponse,
    );

    expect(summarizeV1Detail(v1Detail)).toEqual(
      CUSTOMER_BEHAVIOR_FIXTURE.detail.expected,
    );
    expect(summarizeV2Detail(v2Detail)).toEqual(
      CUSTOMER_BEHAVIOR_FIXTURE.detail.expected,
    );
    expect(v1Detail.recent_follow_ups).toHaveLength(10);
    expect(v2Detail.recent_follow_ups).toHaveLength(10);
    expect(v1Detail.open_reminders?.map(({ status }) => status)).toEqual([
      "pending",
      "snoozed",
      "overdue",
    ]);
    expect(v2Detail.open_reminders.map(({ status }) => status)).toEqual([
      "pending",
      "snoozed",
      "overdue",
    ]);
  });

  it("locks a six-field update result shared by V1 and V2", () => {
    const { customers } = CUSTOMER_BEHAVIOR_FIXTURE.seed;
    const { update } = CUSTOMER_BEHAVIOR_FIXTURE;
    const original = customers.find(({ id }) => id === update.customerId);
    expect(original).toBeDefined();

    const parsedInput = V1CustomerUpdateSchema.parse(update.input);
    const updated = V2CustomerSchema.parse({
      ...original!,
      ...parsedInput,
      updated_at: CUSTOMER_BEHAVIOR_TIMES.restored,
    });
    const v1Updated = V1CustomerSchema.parse(updated);

    expect(customerFields(v1Updated)).toEqual(update.expectedFields);
    expect(customerFields(updated)).toEqual(update.expectedFields);
  });

  it("locks soft-delete and compare-and-set reminder linkage expectations", () => {
    const { customers } = CUSTOMER_BEHAVIOR_FIXTURE.seed;
    const { deleteRestore } = CUSTOMER_BEHAVIOR_FIXTURE;
    const activeCustomer = customers.find(
      ({ id }) => id === deleteRestore.customerId,
    );
    expect(activeCustomer).toBeDefined();

    const deletedCustomer = V2CustomerSchema.parse({
      ...activeCustomer!,
      deleted_at: deleteRestore.deletedAt,
      updated_at: deleteRestore.deletedAt,
    });
    expect(V1CustomerSchema.parse(deletedCustomer).deleted_at).toBe(
      deleteRestore.deletedAt,
    );

    const beforeById = new Map(
      deleteRestore.reminderStates.before.map((state) => [state.id, state]),
    );
    const deletedById = new Map(
      deleteRestore.reminderStates.afterDelete.map((state) => [
        state.id,
        state,
      ]),
    );
    for (const id of [
      CUSTOMER_BEHAVIOR_IDS.reminderPending,
      CUSTOMER_BEHAVIOR_IDS.reminderSnoozed,
      CUSTOMER_BEHAVIOR_IDS.reminderOverdue,
      CUSTOMER_BEHAVIOR_IDS.reminderOverridden,
    ]) {
      expect(deletedById.get(id)).toMatchObject({
        status: "ignored",
        resolution: "Customer deleted",
        deletion_event_id: CUSTOMER_BEHAVIOR_IDS.deletionEvent,
      });
    }
    expect(deletedById.get(CUSTOMER_BEHAVIOR_IDS.reminderCompleted)).toEqual(
      beforeById.get(CUSTOMER_BEHAVIOR_IDS.reminderCompleted),
    );

    const externallyChanged =
      deleteRestore.reminderStates.afterExternalOverride.find(
        ({ id }) => id === CUSTOMER_BEHAVIOR_IDS.reminderOverridden,
      );
    const afterRestore = deleteRestore.reminderStates.afterRestore;
    expect(
      afterRestore.find(
        ({ id }) => id === CUSTOMER_BEHAVIOR_IDS.reminderOverridden,
      ),
    ).toEqual(externallyChanged);
    for (const id of [
      CUSTOMER_BEHAVIOR_IDS.reminderPending,
      CUSTOMER_BEHAVIOR_IDS.reminderSnoozed,
      CUSTOMER_BEHAVIOR_IDS.reminderOverdue,
      CUSTOMER_BEHAVIOR_IDS.reminderCompleted,
    ]) {
      expect(afterRestore.find((state) => state.id === id)).toEqual(
        beforeById.get(id),
      );
    }
  });

  it("locks Customer restore while preserving all related fixture records", () => {
    const { customers, contacts, socialAccounts, deals, followUps, reminders } =
      CUSTOMER_BEHAVIOR_FIXTURE.seed;
    const { deleteRestore } = CUSTOMER_BEHAVIOR_FIXTURE;
    const activeCustomer = customers.find(
      ({ id }) => id === deleteRestore.customerId,
    );

    const restored = V2CustomerSchema.parse({
      ...activeCustomer!,
      deleted_at: null,
      updated_at: CUSTOMER_BEHAVIOR_TIMES.restored,
    });
    expect(V1CustomerSchema.parse(restored).deleted_at).toBeNull();
    expect({
      contacts: contacts.length,
      social_accounts: socialAccounts.length,
      projects_or_deals: deals.length,
      follow_ups: followUps.length,
      reminders: reminders.length,
    }).toEqual({
      contacts: 1,
      social_accounts: 1,
      projects_or_deals: 1,
      follow_ups: 11,
      reminders: 5,
    });
  });

  it("compares all six merge choices and five child reassignment counts", () => {
    const { merge } = CUSTOMER_BEHAVIOR_FIXTURE;
    const source = V2CustomerSchema.parse(merge.sourceCustomer);
    const target = V2CustomerSchema.parse(merge.targetCustomer);
    const choices = CustomerMergeChoicesSchema.parse(merge.choices);

    expect(
      V1CustomerMergeSchema.parse({
        source_id: source.id,
        target_id: target.id,
        field_resolutions: choices,
      }).field_resolutions,
    ).toEqual(choices);
    expect(resolveCustomerMergeFields(source, target, choices)).toEqual(
      merge.expectedFields,
    );
    expect(merge.expectedSourceDeleted).toBe(true);
    expect(merge.expectedChildOwner).toBe(target.id);
    expect(merge.expectedMovedCounts).toEqual({
      contacts: 1,
      social_accounts: 1,
      projects_or_deals: 1,
      follow_ups: 1,
      reminders: 1,
    });
  });
});
