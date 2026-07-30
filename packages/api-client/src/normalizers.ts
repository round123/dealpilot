import type { z } from "zod";
import {
  apiErrorFromBody,
  parseData,
  parseErrorEnvelope,
  parseSuccessEnvelope,
} from "./contracts.js";
import { ApiError, API_ERROR_CODES, errorCodeForStatus } from "./error.js";

export interface PostgrestErrorLike {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
  request_id?: string;
}

export interface PostgrestResponseLike {
  data: unknown;
  error: PostgrestErrorLike | null;
  status: number;
  statusText?: string;
  count?: number | null;
}

export interface FunctionErrorLike {
  name?: string;
  message: string;
  context?: unknown;
}

export interface FunctionResponseLike {
  data: unknown;
  error: FunctionErrorLike | null;
}

function postgrestErrorCode(error: PostgrestErrorLike, status: number): string {
  if (error.code === "23505") return API_ERROR_CODES.conflict;
  if (error.code === "42501") return API_ERROR_CODES.forbidden;
  if (error.code === "PGRST116") return API_ERROR_CODES.notFound;
  return error.code || errorCodeForStatus(status);
}

export function normalizePostgrestResponse<T>(
  response: PostgrestResponseLike,
  schema: z.ZodType<T>,
): T {
  if (response.error !== null) {
    throw new ApiError({
      code: postgrestErrorCode(response.error, response.status),
      message: response.error.message,
      status: response.status,
      requestId: response.error.request_id,
      details: {
        postgresCode: response.error.code,
        details: response.error.details,
        hint: response.error.hint,
      },
    });
  }

  return parseData(
    schema,
    response.status === 204 ? undefined : response.data,
    { status: response.status },
  );
}

export function normalizeRpcResponse<T>(
  response: PostgrestResponseLike,
  schema: z.ZodType<T>,
): T {
  if (response.error !== null) {
    return normalizePostgrestResponse(response, schema);
  }
  if (response.status === 204) {
    return parseData(schema, undefined, { status: response.status });
  }
  return parseSuccessEnvelope(schema, response.data, {
    status: response.status,
  });
}

function isResponse(value: unknown): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}

async function errorFromFunctionContext(
  error: FunctionErrorLike,
): Promise<ApiError | undefined> {
  if (!isResponse(error.context)) return undefined;

  const response = error.context;
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    body = undefined;
  }

  const envelope = parseErrorEnvelope(body);
  const headerRequestId = response.headers.get("x-request-id") ?? undefined;
  if (envelope !== undefined) {
    return apiErrorFromBody(envelope, response.status, headerRequestId);
  }

  return new ApiError({
    code: errorCodeForStatus(response.status),
    message:
      error.message || response.statusText || "Edge Function request failed",
    status: response.status,
    requestId: headerRequestId,
  });
}

export async function normalizeFunctionResponse<T>(
  response: FunctionResponseLike,
  schema: z.ZodType<T>,
): Promise<T> {
  if (response.error !== null) {
    const contextualError = await errorFromFunctionContext(response.error);
    if (contextualError !== undefined) throw contextualError;

    throw new ApiError({
      code: API_ERROR_CODES.functionError,
      message: response.error.message,
      cause: response.error,
    });
  }

  return parseSuccessEnvelope(schema, response.data);
}
