import {
  API_ERROR_CODES,
  ApiError,
  ContactSummarySchema,
  ContactTagIdsSchema,
  ContactTagSchema,
  CustomerContactSchema,
  CustomerDealSchema,
  CustomerReminderSchema,
  DealContactIdsSchema,
  DealContactSchema,
  DealIdSchema,
  ReminderStatusMutationInputSchema,
  cloudRecordSchemaFor,
  toContactCreateInput,
  toContactUpdateInput,
  toCustomerCreateInput,
  toCustomerUpdateInput,
  toDealCreateInput,
  toDealUpdateInput,
  type ContactSummary,
  type ContactTag,
  type CustomerContact,
  type CustomerReminder,
  type CustomerCursorPage,
  type CustomerCursorPageInput,
  type CustomerDeal,
  type DealApi,
  type DealUpdateWithContactsInput,
  type ListSort,
  type DealContact,
  type ReminderStatusMutationInput,
  type ResourceFilters,
} from "@dealpilot/api-client";
import { z } from "zod/v3";
import type {
  CreateParams,
  DataProvider,
  DeleteManyParams,
  DeleteParams,
  GetListParams,
  GetManyParams,
  GetManyReferenceParams,
  GetOneParams,
  Identifier,
  RaRecord,
  UpdateManyParams,
  UpdateParams,
} from "ra-core";

import { getCloudApiClient } from "./apiClient";
import {
  getCustomerCursorRevision,
  invalidateCustomerCursors,
} from "./customerCursorState";

const PAGE_SIZE = 1000;
type ListOptions = {
  signal?: AbortSignal;
  pagination?: { page: number; perPage: number };
  filters?: ResourceFilters;
  sort?: ListSort | readonly ListSort[];
};

export type ApiDataClient = {
  deals: Pick<DealApi, "createWithContacts" | "updateWithContacts">;
  reminders: {
    updateStatus(
      input: ReminderStatusMutationInput,
      options?: { signal?: AbortSignal },
    ): Promise<CustomerReminder>;
  };
  customers: {
    listCustomers(
      input: CustomerCursorPageInput,
      options?: { signal?: AbortSignal },
    ): Promise<CustomerCursorPage>;
  };
  list<T>(
    resource: string,
    schema: unknown,
    options?: ListOptions,
  ): Promise<{ data: T[]; total: number }>;
  getOne<T>(
    resource: string,
    id: string,
    schema: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
  create<T>(
    resource: string,
    input: object,
    schema: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
  update<T>(
    resource: string,
    id: string,
    input: object,
    schema: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
  delete<T>(
    resource: string,
    id: string,
    schema: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
  deleteWhere<T>(
    resource: string,
    filters: ResourceFilters,
    schema: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<T[]>;
};

const signalOf = (params: unknown) =>
  (params as { signal?: AbortSignal }).signal;

const idempotencyKeyOf = (params: unknown) => {
  const value = (params as { meta?: { idempotencyKey?: unknown } }).meta
    ?.idempotencyKey;
  return value === undefined
    ? crypto.randomUUID()
    : z.string().uuid().parse(value);
};

const isReminderStatusAction = (input: object) =>
  "status" in input &&
  ["completed", "snoozed", "ignored", "replied"].includes(String(input.status));

const toComparable = (value: unknown) =>
  typeof value === "number" ? value : String(value ?? "");

const parseListValue = (value: unknown, open: string, close: string) => {
  if (
    typeof value !== "string" ||
    !value.startsWith(open) ||
    !value.endsWith(close)
  ) {
    return [];
  }
  return value
    .slice(1, -1)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const includesText = (actual: unknown, expected: unknown) =>
  String(actual ?? "")
    .toLocaleLowerCase()
    .includes(
      String(expected ?? "")
        .replaceAll("%", "")
        .toLocaleLowerCase(),
    );

const matchesEntry = (
  record: RaRecord,
  key: string,
  expected: unknown,
): boolean => {
  if (expected === undefined) return true;
  if (key === "q") {
    return Object.values(record).some((value) =>
      typeof value === "string" ? includesText(value, expected) : false,
    );
  }
  if (key === "@or") {
    if (typeof expected !== "object" || expected === null) return false;
    return Object.entries(expected).some(([orKey, orValue]) =>
      matchesEntry(record, orKey, orValue),
    );
  }

  const separator = key.lastIndexOf("@");
  const field = separator === -1 ? key : key.slice(0, separator);
  const operator = separator === -1 ? "eq" : key.slice(separator + 1);
  const actual = record[field];

  switch (operator) {
    case "eq":
      return actual === expected || String(actual) === String(expected);
    case "neq":
      return actual !== expected && String(actual) !== String(expected);
    case "is":
      return actual === expected;
    case "not.is":
      return actual !== expected;
    case "lt":
      return toComparable(actual) < toComparable(expected);
    case "lte":
      return toComparable(actual) <= toComparable(expected);
    case "gt":
      return toComparable(actual) > toComparable(expected);
    case "gte":
      return toComparable(actual) >= toComparable(expected);
    case "in":
      return parseListValue(expected, "(", ")").includes(String(actual));
    case "cs": {
      if (!Array.isArray(actual)) return false;
      const expectedItems = parseListValue(expected, "{", "}");
      return expectedItems.every((item) =>
        actual.some((actualItem) => String(actualItem) === item),
      );
    }
    case "ilike":
      return includesText(actual, expected);
    default:
      return false;
  }
};

export const applyRaFilters = <RecordType extends RaRecord>(
  records: RecordType[],
  filter: Record<string, unknown> = {},
) =>
  records.filter((record) =>
    Object.entries(filter).every(([key, value]) =>
      matchesEntry(record, key, value),
    ),
  );

const sortRecords = <RecordType extends RaRecord>(
  records: RecordType[],
  sort: GetListParams["sort"],
) => {
  if (!sort?.field) return records;
  const direction = sort.order === "DESC" ? -1 : 1;
  return [...records].sort((left, right) => {
    const a = toComparable(left[sort.field]);
    const b = toComparable(right[sort.field]);
    return a < b ? -direction : a > b ? direction : 0;
  });
};

const fetchAll = async <RecordType>(
  client: ApiDataClient,
  resource: string,
  signal?: AbortSignal,
  schemaOverride?: unknown,
) => {
  const schema = schemaOverride ?? cloudRecordSchemaFor(resource);
  const first = await client.list<RecordType>(resource, schema, {
    signal,
    pagination: { page: 1, perPage: PAGE_SIZE },
  });
  const pageCount = Math.ceil(first.total / PAGE_SIZE);
  if (pageCount <= 1) return first.data;

  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      client.list<RecordType>(resource, schema, {
        signal,
        pagination: { page: index + 2, perPage: PAGE_SIZE },
      }),
    ),
  );
  return [first.data, ...remaining.map(({ data }) => data)].flat();
};

const toCustomerCursorQuery = (
  params: GetListParams,
): Omit<CustomerCursorPageInput, "cursor"> => ({
  limit: params.pagination?.perPage ?? 25,
  search:
    typeof params.filter?.q === "string" && params.filter.q.trim()
      ? params.filter.q.trim()
      : null,
  grade:
    typeof params.filter?.grade === "string"
      ? (params.filter.grade as "A" | "B" | "C")
      : null,
  status:
    typeof params.filter?.status === "string"
      ? (params.filter.status as "active" | "inactive")
      : null,
  sortField: (params.sort?.field ??
    "created_at") as CustomerCursorPageInput["sortField"],
  sortOrder: params.sort?.order === "ASC" ? "asc" : "desc",
});

type CustomerCursorState = {
  cursors: Map<number, string | null>;
  total: number;
};

const customerCursorKey = (query: Omit<CustomerCursorPageInput, "cursor">) =>
  JSON.stringify(query);

/**
 * The cloud schema stores a stable, case-insensitive identity alongside the
 * value shown to the user. Keep this normalization at the API adapter
 * boundary so every cloud write (including React Admin forms) satisfies the
 * database constraint and duplicate guard.
 */
const normalizeSocialAccountInput = (input: object) => {
  const data = input as {
    platform?: unknown;
    raw_identifier?: unknown;
    normalized_identifier?: unknown;
  };
  if (typeof data.raw_identifier !== "string") return input;

  const rawIdentifier = data.raw_identifier.trim();
  return {
    ...data,
    platform:
      typeof data.platform === "string"
        ? data.platform.trim().toLocaleLowerCase()
        : data.platform,
    raw_identifier: rawIdentifier,
    normalized_identifier:
      typeof data.normalized_identifier === "string" &&
      data.normalized_identifier.trim()
        ? data.normalized_identifier.trim().toLocaleLowerCase()
        : rawIdentifier.toLocaleLowerCase(),
  };
};

const normalizeResourceInput = (resource: string, input: object) =>
  resource === "social_accounts" ? normalizeSocialAccountInput(input) : input;

const contactTagIdsOf = (input: object): string[] | undefined => {
  const data = input as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(data, "tags")) return undefined;
  return [...new Set(ContactTagIdsSchema.parse(data.tags ?? []))];
};

const syncContactTags = async (
  client: ApiDataClient,
  contactId: string,
  desiredTagIds: readonly string[],
  signal?: AbortSignal,
) => {
  const existing = await client.list<ContactTag>(
    "contact_tags",
    ContactTagSchema,
    {
      signal,
      filters: { contact_id: { operator: "eq", value: contactId } },
      pagination: { page: 1, perPage: PAGE_SIZE },
    },
  );
  const desired = new Set(desiredTagIds);
  const current = new Set(existing.data.map(({ tag_id }) => tag_id));
  const removed = [...current].filter((tagId) => !desired.has(tagId));
  const added = [...desired].filter((tagId) => !current.has(tagId));

  const inserted: string[] = [];
  try {
    for (const tagId of added) {
      await client.create<ContactTag>(
        "contact_tags",
        { contact_id: contactId, tag_id: tagId },
        ContactTagSchema,
        { signal },
      );
      inserted.push(tagId);
    }
  } catch (error) {
    if (inserted.length > 0) {
      try {
        await client.deleteWhere<ContactTag>(
          "contact_tags",
          {
            contact_id: { operator: "eq", value: contactId },
            tag_id: { operator: "in", value: inserted },
          },
          ContactTagSchema,
        );
      } catch (rollbackError) {
        throw new ApiError({
          code: API_ERROR_CODES.server,
          message: "Contact tag update failed and rollback was incomplete",
          details: {
            rollback_error:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          },
          cause: error,
        });
      }
    }
    throw error;
  }

  // Deleting stale links is one PostgREST statement. If it fails, the old
  // links remain and retrying the same desired set converges safely.
  if (removed.length > 0) {
    await client.deleteWhere<ContactTag>(
      "contact_tags",
      {
        contact_id: { operator: "eq", value: contactId },
        tag_id: { operator: "in", value: removed },
      },
      ContactTagSchema,
      { signal },
    );
  }
};

const dealContactIdsOf = (
  input: object,
): DealUpdateWithContactsInput["contactIds"] | undefined => {
  const data = input as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(data, "contact_ids")) {
    return undefined;
  }
  const parsed = DealContactIdsSchema.safeParse(data.contact_ids);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const suffix = issue.path.join(".");
      const field = suffix ? `contact_ids.${suffix}` : "contact_ids";
      (fields[field] ??= []).push(issue.message);
    }
    throw new ApiError({
      code: API_ERROR_CODES.validation,
      message: "Invalid Deal contacts",
      fields,
      details: parsed.error.issues,
      cause: parsed.error,
    });
  }
  return [...new Set(parsed.data)];
};

const parseDealCommand = <Command>(
  message: string,
  factory: () => Command,
): Command => {
  try {
    return factory();
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("issues" in error) ||
      !Array.isArray(error.issues)
    ) {
      throw error;
    }
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues as Array<{
      path: Array<string | number>;
      message: string;
    }>) {
      const field = issue.path.join(".") || "request";
      (fields[field] ??= []).push(issue.message);
    }
    throw new ApiError({
      code: API_ERROR_CODES.validation,
      message,
      fields,
      details: error.issues,
      cause: error,
    });
  }
};

const toReactAdminDeal = (
  deal: CustomerDeal,
  contactIds: readonly string[],
) => {
  const { owner_user_id, sort_index, ...record } = deal;
  return {
    ...record,
    sales_id: owner_user_id,
    index: sort_index ?? 0,
    contact_ids: [...contactIds],
  };
};

const listDealContacts = (
  client: ApiDataClient,
  dealId: string,
  signal?: AbortSignal,
) =>
  client.list<DealContact>("deal_contacts", DealContactSchema, {
    signal,
    filters: { deal_id: { operator: "eq", value: dealId } },
    pagination: { page: 1, perPage: PAGE_SIZE },
  });

export const createApiDataProvider = (
  client = getCloudApiClient() as unknown as ApiDataClient,
): DataProvider => {
  const customerCursors = new Map<string, CustomerCursorState>();
  let cursorRevision = getCustomerCursorRevision();

  const readContactSummary = (contactId: string, signal?: AbortSignal) =>
    client.getOne<ContactSummary>(
      "contacts_summary",
      contactId,
      ContactSummarySchema,
      { signal },
    );

  const updateContact = async (
    contactId: string,
    input: object,
    signal?: AbortSignal,
  ) => {
    const payload = toContactUpdateInput(input as Record<string, unknown>);
    const tagIds = contactTagIdsOf(input);
    if (Object.keys(payload).length > 0) {
      await client.update<CustomerContact>(
        "contacts",
        contactId,
        payload,
        CustomerContactSchema,
        { signal },
      );
    }
    if (tagIds !== undefined) {
      await syncContactTags(client, contactId, tagIds, signal);
    }
    return readContactSummary(contactId, signal);
  };

  const fetchAllDeals = async (signal?: AbortSignal) => {
    const [deals, links] = await Promise.all([
      fetchAll<CustomerDeal>(client, "deals", signal, CustomerDealSchema),
      fetchAll<DealContact>(client, "deal_contacts", signal, DealContactSchema),
    ]);
    const contactIdsByDeal = new Map<string, string[]>();
    for (const link of links) {
      const dealId = String(link.deal_id);
      const contactIds = contactIdsByDeal.get(dealId) ?? [];
      contactIds.push(String(link.contact_id));
      contactIdsByDeal.set(dealId, contactIds);
    }
    return deals.map((deal) =>
      toReactAdminDeal(deal, contactIdsByDeal.get(String(deal.id)) ?? []),
    );
  };

  const readDeal = async (dealId: string, signal?: AbortSignal) => {
    const [deal, links] = await Promise.all([
      client.getOne<CustomerDeal>("deals", dealId, CustomerDealSchema, {
        signal,
      }),
      listDealContacts(client, dealId, signal),
    ]);
    return toReactAdminDeal(
      deal,
      links.data.map(({ contact_id }) => String(contact_id)),
    );
  };

  const createDeal = async (input: object, signal?: AbortSignal) => {
    const command = parseDealCommand("Invalid Deal create command", () => ({
      input: toDealCreateInput(input as Record<string, unknown>),
      contactIds: dealContactIdsOf(input) ?? [],
    }));
    const result = await client.deals.createWithContacts(command, { signal });
    return toReactAdminDeal(result.deal, result.contactIds);
  };

  const updateDeal = async (
    dealId: string,
    input: object,
    previousData: object | undefined,
    signal?: AbortSignal,
  ) => {
    const command = parseDealCommand("Invalid Deal update command", () => ({
      dealId: DealIdSchema.parse(dealId),
      patch: toDealUpdateInput(input as Record<string, unknown>),
      contactIds: dealContactIdsOf(input),
      expectedUpdatedAt:
        typeof (previousData as Record<string, unknown> | undefined)
          ?.updated_at === "string"
          ? ((previousData as Record<string, unknown>).updated_at as string)
          : undefined,
    }));
    const result = await client.deals.updateWithContacts(command, { signal });

    return toReactAdminDeal(result.deal, result.contactIds);
  };

  const fetchCustomerPage = async <RecordType extends RaRecord>(
    params: GetListParams,
  ) => {
    const currentRevision = getCustomerCursorRevision();
    if (currentRevision !== cursorRevision) {
      customerCursors.clear();
      cursorRevision = currentRevision;
    }

    const page = params.pagination?.page ?? 1;
    const query = toCustomerCursorQuery(params);
    const key = customerCursorKey(query);
    let state = customerCursors.get(key);
    if (!state) {
      state = { cursors: new Map([[1, null]]), total: 0 };
      customerCursors.set(key, state);
    }

    if (page === 1) {
      state.cursors = new Map([[1, null]]);
    }

    let cursor = state.cursors.get(page);
    if (cursor === undefined) {
      const knownPages = [...state.cursors.keys()].filter(
        (knownPage) => knownPage < page,
      );
      let bridgePage = knownPages.length > 0 ? Math.max(...knownPages) : 1;
      cursor = state.cursors.get(bridgePage) ?? null;

      while (bridgePage < page) {
        const bridge = await client.customers.listCustomers(
          { ...query, cursor },
          { signal: signalOf(params) },
        );
        state.total = bridge.total;
        const nextCursor = bridge.next_cursor;
        if (nextCursor === null) {
          return {
            data: [] as RecordType[],
            total: bridge.total,
            pageInfo: { hasNextPage: false, hasPreviousPage: page > 1 },
          };
        }
        bridgePage += 1;
        cursor = nextCursor;
        state.cursors.set(bridgePage, cursor);
      }
    }

    const result = await client.customers.listCustomers(
      { ...query, cursor: cursor ?? null },
      { signal: signalOf(params) },
    );
    state.total = result.total;
    if (result.next_cursor === null) {
      state.cursors.delete(page + 1);
    } else {
      state.cursors.set(page + 1, result.next_cursor);
    }

    return {
      data: result.items as unknown as RecordType[],
      total: result.total,
      pageInfo: {
        hasNextPage: result.next_cursor !== null,
        hasPreviousPage: page > 1,
      },
    };
  };

  const getList = async <RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetListParams,
  ) => {
    if (resource === "companies_summary") {
      return fetchCustomerPage<RecordType>(params);
    }

    if (resource === "deals") {
      const records = (await fetchAllDeals(
        signalOf(params),
      )) as unknown as RecordType[];
      const filtered = applyRaFilters(records, params.filter);
      const sorted = sortRecords(filtered, params.sort);
      const pagination = params.pagination ?? { page: 1, perPage: 25 };
      const start = (pagination.page - 1) * pagination.perPage;
      return {
        data: sorted.slice(start, start + pagination.perPage),
        total: filtered.length,
      };
    }

    const records = await fetchAll<RecordType>(
      client,
      resource,
      signalOf(params),
    );
    const filtered = applyRaFilters(records, params.filter);
    const sorted = sortRecords(filtered, params.sort);
    const pagination = params.pagination ?? { page: 1, perPage: 25 };
    const start = (pagination.page - 1) * pagination.perPage;
    return {
      data: sorted.slice(start, start + pagination.perPage),
      total: filtered.length,
    };
  };

  return {
    supportAbortSignal: true,
    getList,
    async getOne<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: GetOneParams<RecordType>,
    ) {
      if (resource === "deals") {
        return {
          data: (await readDeal(
            String(params.id),
            signalOf(params),
          )) as unknown as RecordType,
        };
      }
      const data = await client.getOne<RecordType>(
        resource,
        String(params.id),
        cloudRecordSchemaFor(resource),
        { signal: signalOf(params) },
      );
      return { data };
    },
    async getMany<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: GetManyParams<RecordType>,
    ) {
      if (resource === "deals") {
        const records = (await fetchAllDeals(
          signalOf(params),
        )) as unknown as RecordType[];
        const ids = new Set(params.ids.map(String));
        return { data: records.filter((record) => ids.has(String(record.id))) };
      }
      const records = await fetchAll<RecordType>(
        client,
        resource,
        signalOf(params),
      );
      const ids = new Set(params.ids.map(String));
      return { data: records.filter((record) => ids.has(String(record.id))) };
    },
    getManyReference<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: GetManyReferenceParams,
    ) {
      return getList<RecordType>(resource, {
        ...params,
        filter: { ...params.filter, [params.target]: params.id },
      });
    },
    async create<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: CreateParams<RecordType>,
    ) {
      if (resource === "deals") {
        return {
          data: (await createDeal(
            params.data,
            signalOf(params),
          )) as unknown as RecordType,
        };
      }
      if (resource === "contacts") {
        const input = params.data as Record<string, unknown>;
        const tagIds = contactTagIdsOf(input) ?? [];
        const contact = await client.create<CustomerContact>(
          "contacts",
          toContactCreateInput(input),
          CustomerContactSchema,
          { signal: signalOf(params) },
        );
        try {
          await syncContactTags(
            client,
            String(contact.id),
            tagIds,
            signalOf(params),
          );
        } catch (error) {
          try {
            await client.delete<CustomerContact>(
              "contacts",
              String(contact.id),
              CustomerContactSchema,
            );
          } catch (rollbackError) {
            throw new ApiError({
              code: API_ERROR_CODES.server,
              message: "Contact create failed and rollback was incomplete",
              details: {
                rollback_error:
                  rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError),
              },
              cause: error,
            });
          }
          throw error;
        }
        return {
          data: (await readContactSummary(
            String(contact.id),
            signalOf(params),
          )) as unknown as RecordType,
        };
      }
      const data = await client.create<RecordType>(
        resource,
        resource === "companies"
          ? toCustomerCreateInput(params.data as Record<string, unknown>)
          : normalizeResourceInput(resource, params.data),
        cloudRecordSchemaFor(resource),
        { signal: signalOf(params) },
      );
      if (resource === "companies") invalidateCustomerCursors();
      return { data };
    },
    async update<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: UpdateParams<RecordType>,
    ) {
      if (resource === "deals") {
        return {
          data: (await updateDeal(
            String(params.id),
            params.data,
            params.previousData,
            signalOf(params),
          )) as unknown as RecordType,
        };
      }
      if (resource === "reminders" && isReminderStatusAction(params.data)) {
        const command = ReminderStatusMutationInputSchema.parse({
          reminderId: String(params.id),
          idempotencyKey: idempotencyKeyOf(params),
          status: params.data.status,
          snoozeUntil: params.data.snooze_until,
          resolution: params.data.resolution,
        });
        const data = await client.reminders.updateStatus(command, {
          signal: signalOf(params),
        });
        return {
          data: CustomerReminderSchema.parse(data) as unknown as RecordType,
        };
      }
      if (resource === "contacts") {
        return {
          data: (await updateContact(
            String(params.id),
            params.data,
            signalOf(params),
          )) as unknown as RecordType,
        };
      }
      const data = await client.update<RecordType>(
        resource,
        String(params.id),
        resource === "companies"
          ? toCustomerUpdateInput(params.data as Record<string, unknown>)
          : normalizeResourceInput(resource, params.data),
        cloudRecordSchemaFor(resource),
        { signal: signalOf(params) },
      );
      if (resource === "companies") invalidateCustomerCursors();
      return { data };
    },
    async updateMany<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: UpdateManyParams,
    ) {
      if (resource === "reminders" && isReminderStatusAction(params.data)) {
        throw new ApiError({
          code: API_ERROR_CODES.validation,
          message: "Bulk reminder status actions are not supported",
        });
      }
      if (resource === "contacts") {
        await Promise.all(
          params.ids.map((id) =>
            updateContact(String(id), params.data, signalOf(params)),
          ),
        );
        return { data: params.ids };
      }
      await Promise.all(
        params.ids.map((id) =>
          client.update<RecordType>(
            resource,
            String(id),
            resource === "companies"
              ? toCustomerUpdateInput(params.data as Record<string, unknown>)
              : normalizeResourceInput(resource, params.data),
            cloudRecordSchemaFor(resource),
            { signal: signalOf(params) },
          ),
        ),
      );
      if (resource === "companies") invalidateCustomerCursors();
      return { data: params.ids };
    },
    async delete<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: DeleteParams<RecordType>,
    ) {
      const data = await client.delete<RecordType>(
        resource,
        String(params.id),
        cloudRecordSchemaFor(resource),
        { signal: signalOf(params) },
      );
      if (resource === "companies") invalidateCustomerCursors();
      return { data };
    },
    async deleteMany<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: DeleteManyParams<RecordType>,
    ) {
      await Promise.all(
        params.ids.map((id) =>
          client.delete<RecordType>(
            resource,
            String(id),
            cloudRecordSchemaFor(resource),
            { signal: signalOf(params) },
          ),
        ),
      );
      if (resource === "companies") invalidateCustomerCursors();
      return { data: params.ids as Identifier[] };
    },
  };
};
