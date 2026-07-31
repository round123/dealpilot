import { z } from "zod/v3";
import {
  CustomerSchema,
  CustomerSummarySchema,
  type ListSort,
  type ResourceFilters,
} from "@dealpilot/api-client";
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

const PAGE_SIZE = 1000;
const RecordSchema = z
  .object({ id: z.union([z.string(), z.number()]) })
  .passthrough();

type ListOptions = {
  signal?: AbortSignal;
  pagination?: { page: number; perPage: number };
  filters?: ResourceFilters;
  sort?: ListSort | readonly ListSort[];
};

export type ApiDataClient = {
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
};

const signalOf = (params: unknown) =>
  (params as { signal?: AbortSignal }).signal;

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

const fetchAll = async <RecordType extends RaRecord>(
  client: ApiDataClient,
  resource: string,
  signal?: AbortSignal,
) => {
  const first = await client.list<RecordType>(resource, RecordSchema, {
    signal,
    pagination: { page: 1, perPage: PAGE_SIZE },
  });
  const pageCount = Math.ceil(first.total / PAGE_SIZE);
  if (pageCount <= 1) return first.data;

  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      client.list<RecordType>(resource, RecordSchema, {
        signal,
        pagination: { page: index + 2, perPage: PAGE_SIZE },
      }),
    ),
  );
  return [first.data, ...remaining.map(({ data }) => data)].flat();
};

const toCustomerFilters = (
  filter: Record<string, unknown> = {},
): ResourceFilters => {
  const filters: Record<string, ResourceFilters[string]> = {};

  if (typeof filter.q === "string" && filter.q.trim()) {
    filters.search_text = {
      operator: "ilike",
      value: `%${filter.q.trim()}%`,
    };
  }
  if (filter["deleted_at@is"] === null) {
    filters.deleted_at = { operator: "is", value: null };
  }
  if (typeof filter.grade === "string") {
    filters.grade = { operator: "eq", value: filter.grade };
  }
  if (typeof filter.status === "string") {
    filters.status = { operator: "eq", value: filter.status };
  }

  return filters;
};

const toCustomerSort = (sort: GetListParams["sort"]): readonly ListSort[] => [
  {
    field: sort?.field ?? "created_at",
    order: sort?.order === "ASC" ? "asc" : "desc",
  },
  { field: "id", order: "asc" },
];

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

export const createApiDataProvider = (
  client = getCloudApiClient() as unknown as ApiDataClient,
): DataProvider => {
  const getList = async <RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetListParams,
  ) => {
    if (resource === "companies_summary") {
      return client.list<RecordType>(resource, CustomerSummarySchema, {
        signal: signalOf(params),
        filters: toCustomerFilters(params.filter),
        sort: toCustomerSort(params.sort),
        pagination: params.pagination,
      });
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
      const data = await client.getOne<RecordType>(
        resource,
        String(params.id),
        resource === "companies_summary" ? CustomerSummarySchema : RecordSchema,
        { signal: signalOf(params) },
      );
      return { data };
    },
    async getMany<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: GetManyParams<RecordType>,
    ) {
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
      const data = await client.create<RecordType>(
        resource,
        normalizeResourceInput(resource, params.data),
        resource === "companies" ? CustomerSchema : RecordSchema,
        { signal: signalOf(params) },
      );
      return { data };
    },
    async update<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: UpdateParams<RecordType>,
    ) {
      const data = await client.update<RecordType>(
        resource,
        String(params.id),
        normalizeResourceInput(resource, params.data),
        resource === "companies" ? CustomerSchema : RecordSchema,
        { signal: signalOf(params) },
      );
      return { data };
    },
    async updateMany<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: UpdateManyParams,
    ) {
      await Promise.all(
        params.ids.map((id) =>
          client.update<RecordType>(
            resource,
            String(id),
            normalizeResourceInput(resource, params.data),
            resource === "companies" ? CustomerSchema : RecordSchema,
            { signal: signalOf(params) },
          ),
        ),
      );
      return { data: params.ids };
    },
    async delete<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: DeleteParams<RecordType>,
    ) {
      const data = await client.delete<RecordType>(
        resource,
        String(params.id),
        resource === "companies" ? CustomerSchema : RecordSchema,
        { signal: signalOf(params) },
      );
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
            resource === "companies" ? CustomerSchema : RecordSchema,
            { signal: signalOf(params) },
          ),
        ),
      );
      return { data: params.ids as Identifier[] };
    },
  };
};
