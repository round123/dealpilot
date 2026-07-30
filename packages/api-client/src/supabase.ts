import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { normalizeThrownError } from "./error.js";
import {
  normalizeFunctionResponse,
  normalizePostgrestResponse,
  normalizeRpcResponse,
  type FunctionResponseLike,
  type PostgrestResponseLike,
} from "./normalizers.js";

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface FunctionRequestOptions extends RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  region?: string;
}

export interface PostgrestQueryLike extends PromiseLike<PostgrestResponseLike> {
  abortSignal(signal: AbortSignal): PostgrestQueryLike;
}

interface AdapterClientLike {
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): PostgrestQueryLike;
  functions: {
    invoke(
      functionName: string,
      options?: FunctionRequestOptions,
    ): Promise<FunctionResponseLike>;
  };
}

export interface SupabaseApiAdapter {
  postgrestResult<T>(
    query: PostgrestQueryLike,
    schema: z.ZodType<T>,
    options?: RequestOptions,
  ): Promise<{ data: T; response: PostgrestResponseLike }>;
  postgrest<T>(
    query: PostgrestQueryLike,
    schema: z.ZodType<T>,
    options?: RequestOptions,
  ): Promise<T>;
  rpc<T>(
    functionName: string,
    args: Record<string, unknown> | undefined,
    schema: z.ZodType<T>,
    options?: RequestOptions & { head?: boolean; get?: boolean; count?: string },
  ): Promise<T>;
  invoke<T>(
    functionName: string,
    schema: z.ZodType<T>,
    options?: FunctionRequestOptions,
  ): Promise<T>;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw normalizeThrownError(signal.reason, signal);
}

async function runPostgrestQuery(
  query: PostgrestQueryLike,
  signal?: AbortSignal,
): Promise<PostgrestResponseLike> {
  throwIfAborted(signal);
  return signal === undefined ? await query : await query.abortSignal(signal);
}

export function createSupabaseApiAdapter(client: SupabaseClient): SupabaseApiAdapter {
  const adapterClient = client as unknown as AdapterClientLike;

  const postgrestResult = async <T>(
    query: PostgrestQueryLike,
    schema: z.ZodType<T>,
    options: RequestOptions = {},
  ): Promise<{ data: T; response: PostgrestResponseLike }> => {
    try {
      const response = await runPostgrestQuery(query, options.signal);
      throwIfAborted(options.signal);
      return {
        data: normalizePostgrestResponse(response, schema),
        response,
      };
    } catch (error) {
      throw normalizeThrownError(error, options.signal);
    }
  };

  return {
    postgrestResult,

    async postgrest<T>(
      query: PostgrestQueryLike,
      schema: z.ZodType<T>,
      options: RequestOptions = {},
    ): Promise<T> {
      const result = await postgrestResult(query, schema, options);
      return result.data;
    },

    async rpc<T>(
      functionName: string,
      args: Record<string, unknown> | undefined,
      schema: z.ZodType<T>,
      options: RequestOptions & { head?: boolean; get?: boolean; count?: string } = {},
    ): Promise<T> {
      try {
        throwIfAborted(options.signal);
        const query = adapterClient.rpc(functionName, args, {
          head: options.head,
          get: options.get,
          count: options.count,
        });
        const response = await runPostgrestQuery(query, options.signal);
        return normalizeRpcResponse(response, schema);
      } catch (error) {
        throw normalizeThrownError(error, options.signal);
      }
    },

    async invoke<T>(
      functionName: string,
      schema: z.ZodType<T>,
      options: FunctionRequestOptions = {},
    ): Promise<T> {
      try {
        throwIfAborted(options.signal);
        const response = await adapterClient.functions.invoke(functionName, options);
        throwIfAborted(options.signal);
        return await normalizeFunctionResponse(response, schema);
      } catch (error) {
        throw normalizeThrownError(error, options.signal);
      }
    },
  };
}
