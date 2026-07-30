import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ApiClientConfig } from "./config.js";
import { createSupabaseClient } from "./factory.js";
import { createAuthApi, type AuthApi } from "./auth.js";
import { createCustomerApi, type CustomerApi } from "./customer.js";
import { createPrivateStorageApi, type PrivateStorageApi } from "./storage.js";
import { API_ERROR_CODES, ApiError } from "./error.js";
import {
  createSupabaseApiAdapter,
  type PostgrestQueryLike,
  type SupabaseApiAdapter,
} from "./supabase.js";

export type FilterScalar = string | number | boolean | null;
export type FilterOperator =
  | "eq"
  | "neq"
  | "is"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "ilike"
  | "in"
  | "contains";

export type FilterContainsValue =
  readonly FilterScalar[] | Readonly<Record<string, FilterScalar>>;

export type StructuredFilter =
  | { operator: "eq" | "neq"; value: FilterScalar }
  | { operator: "is"; value: null | boolean }
  | { operator: "lt" | "lte" | "gt" | "gte"; value: string | number }
  | { operator: "ilike"; value: string }
  | { operator: "in"; value: readonly FilterScalar[] }
  | { operator: "contains"; value: FilterContainsValue };

export type ResourceFilterValue =
  FilterScalar | readonly FilterScalar[] | StructuredFilter;

export type ResourceFilters = Readonly<Record<string, ResourceFilterValue>>;

export interface ApiRequestOptions {
  signal?: AbortSignal;
}

export interface EdgeFunctionOptions extends ApiRequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  region?: string;
}

export interface ListSort {
  field: string;
  order: "asc" | "desc";
}

export interface ListOptions extends ApiRequestOptions {
  select?: string;
  filters?: ResourceFilters;
  sort?: ListSort | readonly ListSort[];
  pagination?: {
    page: number;
    perPage: number;
  };
}

export interface MutationOptions extends ApiRequestOptions {
  select?: string;
}

export interface ByIdOptions extends MutationOptions {
  idField?: string;
}

export interface ListResult<T> {
  data: T[];
  total: number;
}

export interface ApiClient {
  readonly auth: AuthApi;
  readonly customers: CustomerApi;
  readonly storage: PrivateStorageApi;
  list<T>(
    resource: string,
    schema: z.ZodType<T>,
    options?: ListOptions,
  ): Promise<ListResult<T>>;
  getOne<T>(
    resource: string,
    id: string,
    schema: z.ZodType<T>,
    options?: ByIdOptions,
  ): Promise<T>;
  create<T, Input extends object>(
    resource: string,
    input: Input,
    schema: z.ZodType<T>,
    options?: MutationOptions,
  ): Promise<T>;
  update<T, Input extends object>(
    resource: string,
    id: string,
    input: Input,
    schema: z.ZodType<T>,
    options?: ByIdOptions,
  ): Promise<T>;
  delete<T>(
    resource: string,
    id: string,
    schema: z.ZodType<T>,
    options?: ByIdOptions,
  ): Promise<T>;
  rpc<T>(
    functionName: string,
    args: Record<string, unknown> | undefined,
    schema: z.ZodType<T>,
    options?: ApiRequestOptions,
  ): Promise<T>;
  invoke<T>(
    functionName: string,
    schema: z.ZodType<T>,
    options?: EdgeFunctionOptions,
  ): Promise<T>;
}

interface QueryBuilderLike extends PostgrestQueryLike {
  select(columns?: string, options?: Record<string, unknown>): QueryBuilderLike;
  insert(values: Record<string, unknown>): QueryBuilderLike;
  update(values: Record<string, unknown>): QueryBuilderLike;
  delete(): QueryBuilderLike;
  eq(column: string, value: FilterScalar): QueryBuilderLike;
  neq(column: string, value: FilterScalar): QueryBuilderLike;
  in(column: string, values: readonly FilterScalar[]): QueryBuilderLike;
  is(column: string, value: null | boolean): QueryBuilderLike;
  lt(column: string, value: string | number): QueryBuilderLike;
  lte(column: string, value: string | number): QueryBuilderLike;
  gt(column: string, value: string | number): QueryBuilderLike;
  gte(column: string, value: string | number): QueryBuilderLike;
  ilike(column: string, pattern: string): QueryBuilderLike;
  contains(column: string, value: FilterContainsValue): QueryBuilderLike;
  order(column: string, options: { ascending: boolean }): QueryBuilderLike;
  range(from: number, to: number): QueryBuilderLike;
  single(): QueryBuilderLike;
}

interface ResourceClientLike {
  from(resource: string): QueryBuilderLike;
}

function isLegacyFilterArray(
  value: ResourceFilterValue,
): value is readonly FilterScalar[] {
  return Array.isArray(value);
}

function listSorts(sort: ListOptions["sort"]): readonly ListSort[] {
  if (sort === undefined) return [];
  return Array.isArray(sort) ? sort : [sort as ListSort];
}

function applyFilters(
  query: QueryBuilderLike,
  filters: ResourceFilters = {},
): QueryBuilderLike {
  return Object.entries(filters).reduce((current, [field, value]) => {
    if (isLegacyFilterArray(value)) return current.in(field, value);
    if (value === null) return current.is(field, null);
    if (typeof value !== "object") return current.eq(field, value);

    switch (value.operator) {
      case "eq":
        return current.eq(field, value.value);
      case "neq":
        return current.neq(field, value.value);
      case "is":
        return current.is(field, value.value);
      case "lt":
        return current.lt(field, value.value);
      case "lte":
        return current.lte(field, value.value);
      case "gt":
        return current.gt(field, value.value);
      case "gte":
        return current.gte(field, value.value);
      case "ilike":
        return current.ilike(field, value.value);
      case "in":
        return current.in(field, value.value);
      case "contains":
        return current.contains(field, value.value);
      default:
        throw new ApiError({
          code: API_ERROR_CODES.validation,
          message: `Unsupported filter operator for ${field}`,
          fields: { [field]: ["Unsupported filter operator"] },
        });
    }
  }, query);
}

function assertPagination(options: ListOptions["pagination"]): void {
  if (options === undefined) return;
  if (
    options.page >= 1 &&
    Number.isInteger(options.page) &&
    options.perPage >= 1 &&
    Number.isInteger(options.perPage)
  ) {
    return;
  }

  throw new ApiError({
    code: API_ERROR_CODES.validation,
    message: "Pagination values must be positive integers",
    fields: {
      page: ["Must be a positive integer"],
      perPage: ["Must be a positive integer"],
    },
  });
}

class SupabaseResourceGateway implements ApiClient {
  private readonly resources: ResourceClientLike;
  readonly auth: AuthApi;
  readonly customers: CustomerApi;
  readonly storage: PrivateStorageApi;

  constructor(
    client: SupabaseClient,
    private readonly adapter: SupabaseApiAdapter,
  ) {
    this.resources = client as unknown as ResourceClientLike;
    this.auth = createAuthApi(client);
    this.customers = createCustomerApi(this);
    this.storage = createPrivateStorageApi(client);
  }

  async list<T>(
    resource: string,
    schema: z.ZodType<T>,
    options: ListOptions = {},
  ): Promise<ListResult<T>> {
    assertPagination(options.pagination);
    let query = this.resources
      .from(resource)
      .select(options.select ?? "*", { count: "exact" });
    query = applyFilters(query, options.filters);

    for (const sort of listSorts(options.sort)) {
      query = query.order(sort.field, {
        ascending: sort.order === "asc",
      });
    }
    if (options.pagination !== undefined) {
      const from = (options.pagination.page - 1) * options.pagination.perPage;
      query = query.range(from, from + options.pagination.perPage - 1);
    }

    const result = await this.adapter.postgrestResult(query, z.array(schema), {
      signal: options.signal,
    });
    return {
      data: result.data,
      total: result.response.count ?? result.data.length,
    };
  }

  getOne<T>(
    resource: string,
    id: string,
    schema: z.ZodType<T>,
    options: ByIdOptions = {},
  ): Promise<T> {
    const query = this.resources
      .from(resource)
      .select(options.select ?? "*")
      .eq(options.idField ?? "id", id)
      .single();
    return this.adapter.postgrest(query, schema, { signal: options.signal });
  }

  create<T, Input extends object>(
    resource: string,
    input: Input,
    schema: z.ZodType<T>,
    options: MutationOptions = {},
  ): Promise<T> {
    const query = this.resources
      .from(resource)
      .insert(input as Record<string, unknown>)
      .select(options.select ?? "*")
      .single();
    return this.adapter.postgrest(query, schema, { signal: options.signal });
  }

  update<T, Input extends object>(
    resource: string,
    id: string,
    input: Input,
    schema: z.ZodType<T>,
    options: ByIdOptions = {},
  ): Promise<T> {
    const query = this.resources
      .from(resource)
      .update(input as Record<string, unknown>)
      .eq(options.idField ?? "id", id)
      .select(options.select ?? "*")
      .single();
    return this.adapter.postgrest(query, schema, { signal: options.signal });
  }

  delete<T>(
    resource: string,
    id: string,
    schema: z.ZodType<T>,
    options: ByIdOptions = {},
  ): Promise<T> {
    const query = this.resources
      .from(resource)
      .delete()
      .eq(options.idField ?? "id", id)
      .select(options.select ?? "*")
      .single();
    return this.adapter.postgrest(query, schema, { signal: options.signal });
  }

  rpc<T>(
    functionName: string,
    args: Record<string, unknown> | undefined,
    schema: z.ZodType<T>,
    options: ApiRequestOptions = {},
  ): Promise<T> {
    return this.adapter.rpc(functionName, args, schema, options);
  }

  invoke<T>(
    functionName: string,
    schema: z.ZodType<T>,
    options: EdgeFunctionOptions = {},
  ): Promise<T> {
    return this.adapter.invoke(functionName, schema, options);
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const client = createSupabaseClient(config);
  return new SupabaseResourceGateway(client, createSupabaseApiAdapter(client));
}
