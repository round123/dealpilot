export const API_ERROR_CODES = {
  aborted: "ABORTED",
  network: "NETWORK_ERROR",
  invalidResponse: "INVALID_RESPONSE",
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  validation: "VALIDATION_ERROR",
  rateLimited: "RATE_LIMITED",
  functionError: "FUNCTION_ERROR",
  storage: "STORAGE_ERROR",
  server: "SERVER_ERROR",
  unknown: "UNKNOWN_ERROR",
} as const;

export type BuiltInApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export interface ApiErrorOptions {
  code: string;
  message: string;
  status?: number;
  fields?: FieldErrors;
  requestId?: string;
  details?: unknown;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: FieldErrors;
  readonly requestId: string;
  readonly details?: unknown;

  constructor(options: ApiErrorOptions) {
    super(
      options.message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status ?? 0;
    this.fields = options.fields;
    this.requestId = normalizeRequestId(options.requestId);
    this.details = options.details;
  }

  get isNetworkError(): boolean {
    return this.code === API_ERROR_CODES.network;
  }

  get isAborted(): boolean {
    return this.code === API_ERROR_CODES.aborted;
  }

  get hasFieldErrors(): boolean {
    return this.fields !== undefined && Object.keys(this.fields).length > 0;
  }

  get messageKey(): string {
    return ERROR_MESSAGE_KEYS[this.code] ?? "errors.generic";
  }
}

let clientRequestIdSequence = 0;

function normalizeRequestId(requestId?: string): string {
  const normalized = requestId?.trim();
  if (normalized) return normalized;

  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();

  clientRequestIdSequence += 1;
  return `client-${Date.now().toString(36)}-${clientRequestIdSequence.toString(36)}`;
}

const ERROR_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  [API_ERROR_CODES.aborted]: "errors.aborted",
  [API_ERROR_CODES.network]: "errors.network",
  [API_ERROR_CODES.invalidResponse]: "errors.invalidResponse",
  [API_ERROR_CODES.unauthorized]: "errors.unauthorized",
  [API_ERROR_CODES.forbidden]: "errors.forbidden",
  [API_ERROR_CODES.notFound]: "errors.notFound",
  [API_ERROR_CODES.conflict]: "errors.conflict",
  [API_ERROR_CODES.validation]: "errors.validation",
  [API_ERROR_CODES.rateLimited]: "errors.rateLimited",
  [API_ERROR_CODES.functionError]: "errors.function",
  [API_ERROR_CODES.storage]: "errors.storage",
  [API_ERROR_CODES.server]: "errors.server",
};

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export function normalizeThrownError(
  error: unknown,
  signal?: AbortSignal,
): ApiError {
  if (error instanceof ApiError) return error;

  if (signal?.aborted || isAbortError(error)) {
    return new ApiError({
      code: API_ERROR_CODES.aborted,
      message: "Request was aborted",
      cause: error,
    });
  }

  return new ApiError({
    code: API_ERROR_CODES.network,
    message: error instanceof Error ? error.message : "Network request failed",
    cause: error,
  });
}

export function errorCodeForStatus(status: number): BuiltInApiErrorCode {
  if (status === 401) return API_ERROR_CODES.unauthorized;
  if (status === 403) return API_ERROR_CODES.forbidden;
  if (status === 404) return API_ERROR_CODES.notFound;
  if (status === 409) return API_ERROR_CODES.conflict;
  if (status === 422) return API_ERROR_CODES.validation;
  if (status === 429) return API_ERROR_CODES.rateLimited;
  if (status === 507) return API_ERROR_CODES.storage;
  if (status >= 500) return API_ERROR_CODES.server;
  return API_ERROR_CODES.unknown;
}
