import { API_ERROR_CODES, ApiError } from "@dealpilot/api-client";
import { ErrorResponseSchema } from "@dealpilot/shared";

export const AGENT_TOKEN_STORAGE_KEY = "dealpilot.agent-token";

export interface AgentTokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Parser<T> {
  parse(value: unknown): T;
}

export interface AgentRequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  idempotencyKey?: string;
  responseType?: "json" | "blob";
}

export interface CreateAgentClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  storage?: AgentTokenStorage;
}

export interface AgentClient {
  get<T>(
    path: string,
    parser: Parser<T>,
    options?: Omit<AgentRequestOptions, "body">,
  ): Promise<T>;
  post<T>(
    path: string,
    body: unknown,
    parser: Parser<T>,
    options?: Omit<AgentRequestOptions, "body">,
  ): Promise<T>;
  postForm<T>(
    path: string,
    body: FormData,
    parser: Parser<T>,
    options?: Omit<AgentRequestOptions, "body">,
  ): Promise<T>;
  put<T>(
    path: string,
    body: unknown,
    parser: Parser<T>,
    options?: Omit<AgentRequestOptions, "body">,
  ): Promise<T>;
  delete<T>(
    path: string,
    parser: Parser<T>,
    options?: AgentRequestOptions,
  ): Promise<T>;
  getBlob<T>(
    path: string,
    parser: Parser<T>,
    options?: Omit<AgentRequestOptions, "body" | "responseType">,
  ): Promise<T>;
}

const undefinedParser: Parser<undefined> = {
  parse(value) {
    if (value !== undefined) throw new Error("Expected an empty response");
    return undefined;
  },
};

export const agentVoidParser = undefinedParser;

export function captureAgentToken(
  href = window.location.href,
  storage: AgentTokenStorage = window.sessionStorage,
  replaceUrl: (url: string) => void = (url) =>
    window.history.replaceState(window.history.state, "", url),
): string | null {
  const url = new URL(href);
  const token = url.searchParams.get("token")?.trim();
  if (token) {
    storage.setItem(AGENT_TOKEN_STORAGE_KEY, token);
    url.searchParams.delete("token");
    replaceUrl(`${url.pathname}${url.search}${url.hash}`);
    return token;
  }
  return storage.getItem(AGENT_TOKEN_STORAGE_KEY);
}

export function getAgentToken(
  storage: AgentTokenStorage = window.sessionStorage,
): string | null {
  return storage.getItem(AGENT_TOKEN_STORAGE_KEY);
}

export function clearAgentToken(
  storage: AgentTokenStorage = window.sessionStorage,
): void {
  storage.removeItem(AGENT_TOKEN_STORAGE_KEY);
}

export function createAgentClient({
  baseUrl = import.meta.env.VITE_AGENT_API_URL || window.location.origin,
  // This module is the single, typed network boundary for Local Agent data.
  // eslint-disable-next-line no-restricted-globals
  fetchImpl = fetch,
  storage = window.sessionStorage,
}: CreateAgentClientOptions = {}): AgentClient {
  const apiBaseUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/`;

  const request = async <T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    parser: Parser<T>,
    options: AgentRequestOptions = {},
  ): Promise<T> => {
    const token = storage.getItem(AGENT_TOKEN_STORAGE_KEY);
    if (!token) {
      throw new ApiError({
        code: API_ERROR_CODES.unauthorized,
        message: "Local Agent token is missing",
        status: 401,
      });
    }

    const url = new URL(path.replace(/^\//, ""), apiBaseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    });
    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (method !== "GET") {
      headers.set(
        "Idempotency-Key",
        options.idempotencyKey ?? createIdempotencyKey(),
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body:
          options.body === undefined
            ? undefined
            : options.body instanceof FormData
              ? options.body
              : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (error) {
      const aborted =
        options.signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError");
      throw new ApiError({
        code: aborted ? API_ERROR_CODES.aborted : API_ERROR_CODES.network,
        message: aborted ? "Request was aborted" : "Local Agent is unavailable",
        cause: error,
      });
    }

    const isBlobSuccess = response.ok && options.responseType === "blob";
    const text =
      response.status === 204 || isBlobSuccess ? "" : await response.text();
    const body = isBlobSuccess ? await response.blob() : parseJson(text);
    if (!response.ok) {
      const parsedError = ErrorResponseSchema.safeParse(body);
      if (parsedError.success) {
        throw new ApiError({
          code: parsedError.data.error.code,
          message: parsedError.data.error.message,
          status: response.status,
          requestId:
            parsedError.data.error.request_id ??
            response.headers.get("x-request-id") ??
            undefined,
          fields: parsedError.data.error.fields,
          details: parsedError.data.error.details,
        });
      }
      throw new ApiError({
        code: errorCodeForStatus(response.status),
        message: `Local Agent request failed with status ${response.status}`,
        status: response.status,
        requestId: response.headers.get("x-request-id") ?? undefined,
        details: body,
      });
    }

    try {
      return parser.parse(response.status === 204 ? undefined : body);
    } catch (error) {
      throw new ApiError({
        code: API_ERROR_CODES.invalidResponse,
        message: "Local Agent returned an invalid response",
        status: response.status,
        requestId: response.headers.get("x-request-id") ?? undefined,
        details: body,
        cause: error,
      });
    }
  };

  return {
    get: (path, parser, options) => request("GET", path, parser, options),
    post: (path, body, parser, options) =>
      request("POST", path, parser, { ...options, body }),
    postForm: (path, body, parser, options) =>
      request("POST", path, parser, { ...options, body }),
    put: (path, body, parser, options) =>
      request("PUT", path, parser, { ...options, body }),
    delete: (path, parser, options) => request("DELETE", path, parser, options),
    getBlob: (path, parser, options) =>
      request("GET", path, parser, { ...options, responseType: "blob" }),
  };
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function errorCodeForStatus(status: number): string {
  if (status === 400) return API_ERROR_CODES.validation;
  if (status === 401) return API_ERROR_CODES.unauthorized;
  if (status === 403) return API_ERROR_CODES.forbidden;
  if (status === 404) return API_ERROR_CODES.notFound;
  if (status === 409) return API_ERROR_CODES.conflict;
  if (status === 422) return API_ERROR_CODES.validation;
  if (status === 507) return API_ERROR_CODES.storage;
  if (status >= 500) return API_ERROR_CODES.server;
  return API_ERROR_CODES.unknown;
}
