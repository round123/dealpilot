import {
  API_ERROR_CODES,
  ApiError,
  resolveCustomerMergeFields,
  type Customer,
  type CustomerContact,
  type CustomerDeal,
  type CustomerDetail,
  type CustomerFollowUp,
  type CustomerReminder,
  type CustomerSocialAccount,
  type CustomerSummary,
  type DealId,
  type FollowUpId,
  type ReminderId,
  type UserId,
} from "@dealpilot/api-client";
import type { DataProvider, Identifier, RaRecord } from "ra-core";

import type {
  Company,
  Contact,
  Deal,
  FollowUp,
  Reminder,
  SocialAccount,
} from "../types";
import type { CustomerOperations } from "./customerOperations";

const PAGE_SIZE = 10_000;
const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type LocalReminder = Reminder & {
  deletion_previous_status?: Reminder["status"] | null;
};

type Rollback = () => Promise<unknown>;

export const createLocalCustomerOperations = (
  dataProvider: DataProvider,
): CustomerOperations => {
  const listAll = async <RecordType extends RaRecord>(
    resource: string,
    signal?: AbortSignal,
  ): Promise<RecordType[]> => {
    throwIfAborted(signal);
    const result = await dataProvider.getList<RecordType>(resource, {
      filter: {},
      pagination: { page: 1, perPage: PAGE_SIZE },
      sort: { field: "id", order: "ASC" },
      signal,
    });
    throwIfAborted(signal);
    return result.data;
  };

  const getCompany = async (id: Customer["id"], signal?: AbortSignal) => {
    const companies = await listAll<Company>("companies", signal);
    const company = companies.find((item) => String(item.id) === String(id));
    if (!company) throw notFound("Customer not found");
    return company;
  };

  const updateRecord = async <RecordType extends RaRecord>(
    resource: string,
    record: RecordType,
    data: Partial<RecordType>,
    rollbacks: Rollback[],
  ): Promise<RecordType> => {
    const result = await dataProvider.update<RecordType>(resource, {
      id: record.id,
      data,
      previousData: record,
    });
    rollbacks.push(() =>
      dataProvider.update<RecordType>(resource, {
        id: record.id,
        data: record,
        previousData: result.data,
      }),
    );
    return result.data;
  };

  const getRelatedRecords = async (
    companyId: Identifier,
    signal?: AbortSignal,
  ) => {
    const [contacts, socialAccounts, deals, followUps, reminders] =
      await Promise.all([
        listAll<Contact>("contacts", signal),
        listAll<SocialAccount>("social_accounts", signal),
        listAll<Deal>("deals", signal),
        listAll<FollowUp>("follow_ups", signal),
        listAll<LocalReminder>("reminders", signal),
      ]);
    const relatedContacts = contacts.filter(
      (contact) => String(contact.company_id) === String(companyId),
    );
    return {
      contacts: relatedContacts,
      socialAccounts: socialAccounts.filter(
        (account) => String(account.company_id) === String(companyId),
      ),
      deals: deals.filter(
        (deal) => String(deal.company_id) === String(companyId),
      ),
      followUps: followUps.filter(
        (followUp) => String(followUp.company_id) === String(companyId),
      ),
      reminders: reminders.filter(
        (reminder) => String(reminder.company_id) === String(companyId),
      ),
    };
  };

  return {
    async getCustomerDetail(id, { signal } = {}) {
      return runLocalOperation(signal, async () => {
        const company = await getCompany(id, signal);
        const related = await getRelatedRecords(company.id, signal);
        return toCustomerDetail(company, related);
      });
    },

    async listMergeCandidates({ sourceId, search, page, perPage, signal }) {
      return runLocalOperation(signal, async () => {
        const companies = await listAll<Company>("companies", signal);
        const normalizedSearch = search.trim().toLocaleLowerCase();
        const active = companies
          .filter(
            (company) =>
              company.deleted_at == null &&
              String(company.id) !== String(sourceId) &&
              (!normalizedSearch ||
                [company.name, company.company, company.country].some((value) =>
                  String(value ?? "")
                    .toLocaleLowerCase()
                    .includes(normalizedSearch),
                )),
          )
          .sort(compareCompanies);
        const [contacts, deals] = await Promise.all([
          listAll<Contact>("contacts", signal),
          listAll<Deal>("deals", signal),
        ]);
        const start = Math.max(0, page - 1) * perPage;
        return {
          data: active
            .slice(start, start + perPage)
            .map((company) =>
              toCustomerSummary(
                company,
                contacts.filter(
                  (contact) =>
                    String(contact.company_id) === String(company.id),
                ).length,
                deals.filter(
                  (deal) => String(deal.company_id) === String(company.id),
                ).length,
              ),
            ),
          total: active.length,
        };
      });
    },

    async listDeletedCustomers({ page, perPage, signal }) {
      return runLocalOperation(signal, async () => {
        const deleted = (await listAll<Company>("companies", signal))
          .filter((company) => company.deleted_at != null)
          .sort((left, right) => {
            const byDeletion = String(right.deleted_at).localeCompare(
              String(left.deleted_at),
            );
            return (
              byDeletion || String(left.id).localeCompare(String(right.id))
            );
          });
        const start = Math.max(0, page - 1) * perPage;
        return {
          data: deleted.slice(start, start + perPage).map(toCustomer),
          total: deleted.length,
        };
      });
    },

    async softDeleteCustomer(id, { signal } = {}) {
      return runLocalOperation(signal, async () => {
        const company = await getCompany(id, signal);
        if (company.deleted_at) throw conflict("Customer is already deleted");
        const { reminders } = await getRelatedRecords(company.id, signal);
        const deletedAt = new Date().toISOString();
        const deletionEventId = crypto.randomUUID();
        const rollbacks: Rollback[] = [];
        try {
          for (const reminder of reminders.filter((item) =>
            ["pending", "snoozed", "overdue"].includes(item.status),
          )) {
            throwIfAborted(signal);
            await updateRecord(
              "reminders",
              reminder,
              {
                status: "ignored",
                deletion_event_id: deletionEventId,
                deletion_previous_status: reminder.status,
                updated_at: deletedAt,
              } as Partial<LocalReminder>,
              rollbacks,
            );
          }
          const updated = await updateRecord(
            "companies",
            company,
            {
              deleted_at: deletedAt,
              updated_at: deletedAt,
            } as Partial<Company>,
            rollbacks,
          );
          return toCustomer(updated as Company);
        } catch (error) {
          await rollbackAll(rollbacks);
          throw error;
        }
      });
    },

    async restoreCustomer(id, { signal } = {}) {
      return runLocalOperation(signal, async () => {
        const company = await getCompany(id, signal);
        if (!company.deleted_at) throw conflict("Customer is not deleted");
        if (
          Date.now() - new Date(company.deleted_at).getTime() >
          RESTORE_WINDOW_MS
        ) {
          throw new ApiError({
            code: API_ERROR_CODES.functionError,
            message: "Customer restore window expired",
          });
        }

        const { reminders } = await getRelatedRecords(company.id, signal);
        const rollbacks: Rollback[] = [];
        try {
          for (const reminder of reminders.filter(
            (item) =>
              item.status === "ignored" &&
              item.deletion_event_id != null &&
              item.deletion_previous_status != null,
          )) {
            await updateRecord(
              "reminders",
              reminder,
              {
                status: reminder.deletion_previous_status,
                deletion_event_id: null,
                deletion_previous_status: null,
                updated_at: new Date().toISOString(),
              } as Partial<LocalReminder>,
              rollbacks,
            );
          }
          const restoredAt = new Date().toISOString();
          const updated = await updateRecord(
            "companies",
            company,
            { deleted_at: null, updated_at: restoredAt } as Partial<Company>,
            rollbacks,
          );
          return toCustomer(updated as Company);
        } catch (error) {
          await rollbackAll(rollbacks);
          throw error;
        }
      });
    },

    async mergeCustomers(source, target, choices, { signal } = {}) {
      return runLocalOperation(signal, async () => {
        if (source.id === target.id) {
          throw new ApiError({
            code: API_ERROR_CODES.validation,
            message: "Source and target customer must differ",
          });
        }
        const sourceCompany = await getCompany(source.id, signal);
        const targetCompany = await getCompany(target.id, signal);
        if (sourceCompany.deleted_at || targetCompany.deleted_at) {
          throw conflict("Both customers must be active");
        }
        const [sourceRelated, targetRelated] = await Promise.all([
          getRelatedRecords(sourceCompany.id, signal),
          getRelatedRecords(targetCompany.id, signal),
        ]);
        const fields = resolveCustomerMergeFields(source, target, choices);
        const mergedAt = new Date().toISOString();
        const rollbacks: Rollback[] = [];

        try {
          for (const contact of sourceRelated.contacts) {
            throwIfAborted(signal);
            await updateRecord(
              "contacts",
              contact,
              {
                company_id: targetCompany.id,
                company_name: fields.name,
              } as Partial<Contact>,
              rollbacks,
            );
          }
          for (const deal of sourceRelated.deals) {
            throwIfAborted(signal);
            await updateRecord(
              "deals",
              deal,
              { company_id: targetCompany.id } as Partial<Deal>,
              rollbacks,
            );
          }
          for (const account of sourceRelated.socialAccounts) {
            throwIfAborted(signal);
            await updateRecord(
              "social_accounts",
              account,
              { company_id: targetCompany.id } as Partial<SocialAccount>,
              rollbacks,
            );
          }
          for (const followUp of sourceRelated.followUps) {
            throwIfAborted(signal);
            await updateRecord(
              "follow_ups",
              followUp,
              { company_id: targetCompany.id } as Partial<FollowUp>,
              rollbacks,
            );
          }
          for (const reminder of sourceRelated.reminders) {
            throwIfAborted(signal);
            await updateRecord(
              "reminders",
              reminder,
              { company_id: targetCompany.id } as Partial<LocalReminder>,
              rollbacks,
            );
          }
          const updatedTarget = await updateRecord(
            "companies",
            targetCompany,
            {
              ...fields,
              nb_contacts:
                targetRelated.contacts.length + sourceRelated.contacts.length,
              nb_deals: targetRelated.deals.length + sourceRelated.deals.length,
              updated_at: mergedAt,
            } as Partial<Company>,
            rollbacks,
          );
          await updateRecord(
            "companies",
            sourceCompany,
            { deleted_at: mergedAt, updated_at: mergedAt } as Partial<Company>,
            rollbacks,
          );
          return toCustomer(updatedTarget as Company);
        } catch (error) {
          await rollbackAll(rollbacks);
          throw error;
        }
      });
    },
  };
};

const runLocalOperation = async <Value>(
  signal: AbortSignal | undefined,
  operation: () => Promise<Value>,
): Promise<Value> => {
  try {
    throwIfAborted(signal);
    return await operation();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted || isAbortError(error)) {
      throw new ApiError({
        code: API_ERROR_CODES.aborted,
        message: "Request was aborted",
        cause: error,
      });
    }
    throw new ApiError({
      code: API_ERROR_CODES.unknown,
      message:
        error instanceof Error ? error.message : "Local operation failed",
      cause: error,
    });
  }
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return;
  throw new ApiError({
    code: API_ERROR_CODES.aborted,
    message: "Request was aborted",
  });
};

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const rollbackAll = async (rollbacks: Rollback[]) => {
  for (const rollback of [...rollbacks].reverse()) {
    try {
      await rollback();
    } catch {
      // Preserve the original operation failure; the in-memory adapter has no
      // transaction primitive beyond compensating updates.
    }
  }
};

const notFound = (message: string) =>
  new ApiError({ code: API_ERROR_CODES.notFound, message, status: 404 });

const conflict = (message: string) =>
  new ApiError({ code: API_ERROR_CODES.conflict, message, status: 409 });

const toCustomer = (company: Company): Customer =>
  ({
    id: String(company.id) as Customer["id"],
    owner_user_id: String(company.sales_id ?? "local-user") as UserId,
    name: company.name,
    company: company.company ?? null,
    sector: company.sector ?? null,
    size: company.size ?? null,
    linkedin_url: company.linkedin_url ?? null,
    website: company.website ?? null,
    phone_number: company.phone_number ?? null,
    address: company.address ?? null,
    zipcode: company.zipcode ?? null,
    city: company.city ?? null,
    state_abbr: company.state_abbr ?? null,
    country: company.country ?? null,
    description: company.description ?? null,
    revenue: company.revenue ?? null,
    tax_identifier: company.tax_identifier ?? null,
    logo: toFileJson(company.logo),
    context_links: company.context_links ?? [],
    source: company.source ?? null,
    grade: company.grade ?? "B",
    status: company.status ?? "active",
    deleted_at: company.deleted_at ?? null,
    created_at: company.created_at ?? new Date(0).toISOString(),
    updated_at:
      company.updated_at ?? company.created_at ?? new Date(0).toISOString(),
  }) as Customer;

const toCustomerSummary = (
  company: Company,
  contactCount: number,
  dealCount: number,
): CustomerSummary => {
  const customer = toCustomer(company);
  return {
    ...customer,
    sales_id: customer.owner_user_id,
    nb_contacts: contactCount,
    nb_deals: dealCount,
    search_text: [company.name, company.company, company.country]
      .filter(Boolean)
      .join(" "),
  } as CustomerSummary;
};

const toCustomerDetail = (
  company: Company,
  related: {
    contacts: Contact[];
    socialAccounts: SocialAccount[];
    deals: Deal[];
    followUps: FollowUp[];
    reminders: LocalReminder[];
  },
): CustomerDetail => {
  const ownerUserId = String(company.sales_id ?? "local-user") as UserId;
  return {
    ...toCustomer(company),
    contacts: related.contacts.map((contact) =>
      toCustomerContact(contact, company.id, ownerUserId),
    ),
    social_accounts: related.socialAccounts.map((account) =>
      toCustomerSocialAccount(account, ownerUserId),
    ),
    deals: related.deals.map((deal) =>
      toCustomerDeal(deal, company.id, ownerUserId),
    ),
    recent_follow_ups: related.followUps
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .slice(0, 10)
      .map((followUp) => toCustomerFollowUp(followUp, ownerUserId)),
    open_reminders: related.reminders
      .filter((reminder) =>
        ["pending", "snoozed", "overdue"].includes(reminder.status),
      )
      .sort((left, right) => left.due_at.localeCompare(right.due_at))
      .map((reminder) => toCustomerReminder(reminder, ownerUserId)),
  } as CustomerDetail;
};

const toCustomerSocialAccount = (
  account: SocialAccount,
  ownerUserId: UserId,
): CustomerSocialAccount =>
  ({
    ...account,
    id: String(account.id),
    owner_user_id: ownerUserId,
    company_id: String(account.company_id),
    contact_id: account.contact_id == null ? null : String(account.contact_id),
  }) as CustomerSocialAccount;

const toCustomerContact = (
  contact: Contact,
  companyId: Identifier,
  ownerUserId: UserId,
): CustomerContact =>
  ({
    id: String(contact.id),
    owner_user_id: ownerUserId,
    company_id: String(companyId),
    first_name: contact.first_name ?? null,
    last_name: contact.last_name ?? null,
    name:
      [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null,
    gender: contact.gender ?? null,
    title: contact.title ?? null,
    background: contact.background ?? null,
    avatar: toFileJson(contact.avatar),
    first_seen: contact.first_seen ?? null,
    last_seen: contact.last_seen ?? null,
    has_newsletter: contact.has_newsletter ?? false,
    status: contact.status ?? null,
    linkedin_url: contact.linkedin_url ?? null,
    email_jsonb: contact.email_jsonb ?? [],
    phone_jsonb: contact.phone_jsonb ?? [],
    created_at: contact.first_seen ?? new Date(0).toISOString(),
    updated_at:
      contact.last_seen ?? contact.first_seen ?? new Date(0).toISOString(),
  }) as unknown as CustomerContact;

const DEAL_STAGES: Record<string, CustomerDeal["stage"]> = {
  opportunity: "lead",
  "proposal-sent": "qualified",
  "in-negociation": "proposal",
  "in-negotiation": "negotiation",
  won: "closed_won",
  lost: "closed_lost",
  delayed: "negotiation",
};

const toCustomerDeal = (
  deal: Deal,
  companyId: Identifier,
  ownerUserId: UserId,
): CustomerDeal =>
  ({
    id: String(deal.id),
    owner_user_id: ownerUserId,
    company_id: String(companyId),
    name: deal.name,
    category: deal.category ?? null,
    stage: DEAL_STAGES[deal.stage] ?? "lead",
    grade: "C",
    description: deal.description ?? null,
    currency: "USD",
    amount: deal.amount ?? null,
    probability: null,
    expected_closing_date: deal.expected_closing_date || null,
    closed_reason: null,
    archived_at: deal.archived_at ?? null,
    sort_index: deal.index ?? null,
    created_at: deal.created_at,
    updated_at: deal.updated_at,
  }) as CustomerDeal;

const toCustomerFollowUp = (
  followUp: FollowUp,
  ownerUserId: UserId,
): CustomerFollowUp =>
  ({
    ...followUp,
    id: String(followUp.id) as FollowUpId,
    owner_user_id: ownerUserId,
    company_id: String(followUp.company_id),
    deal_id:
      followUp.deal_id == null ? null : (String(followUp.deal_id) as DealId),
  }) as CustomerFollowUp;

const toCustomerReminder = (
  reminder: Reminder,
  ownerUserId: UserId,
): CustomerReminder =>
  ({
    ...reminder,
    id: String(reminder.id) as ReminderId,
    owner_user_id: ownerUserId,
    company_id: String(reminder.company_id),
    deal_id:
      reminder.deal_id == null ? null : (String(reminder.deal_id) as DealId),
    last_notified_at: reminder.last_notified_at ?? null,
    snooze_until: reminder.snooze_until ?? null,
    resolution: reminder.resolution ?? null,
    deletion_event_id: reminder.deletion_event_id ?? null,
  }) as CustomerReminder;

const toFileJson = (file: unknown) => {
  if (!file || typeof file !== "object") return null;
  const value = file as Record<string, unknown>;
  return Object.fromEntries(
    ["src", "title", "path", "type"]
      .filter((key) => typeof value[key] === "string")
      .map((key) => [key, value[key] as string]),
  );
};

const compareCompanies = (left: Company, right: Company) =>
  left.name.localeCompare(right.name) ||
  String(left.id).localeCompare(String(right.id));
