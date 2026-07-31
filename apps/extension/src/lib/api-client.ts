import { API_ERROR_CODES } from "@dealpilot/api-client/error";
import { ApiError, extensionErrorMessage } from "./extension-errors";
import {
  AGENT_DEFAULT_PORT,
  API_PATHS,
  BindingSchema,
  CustomerDetailSchema,
  CustomerSchema,
  ErrorResponseSchema,
  FollowUpSchema,
  MatchResolveResponseSchema,
  PopupReminderSchema,
  ReminderSchema,
  ReminderStatusUpdateSchema,
  StatsSchema,
  paginatedResponse,
  type Binding,
  type Customer,
  type CustomerCreate,
  type CustomerDetail,
  type FollowUp,
  type FollowUpCreate,
  type MatchBind,
  type MatchUnbind,
  type MatchResolve,
  type MatchResolveResponse,
  type PopupReminder,
  type Reminder,
  type ReminderCreate,
  type ReminderStatusUpdate,
} from "@dealpilot/shared";
import { z } from "zod";

const TOKEN_STORAGE_KEY = "dealpilot_api_token";
const PORT_STORAGE_KEY = "dealpilot_agent_port";
const WORKBENCH_ORIGIN_STORAGE_KEY = "dealpilot_workbench_origin";

const FollowUpPageSchema = paginatedResponse(FollowUpSchema);
const ReminderPageSchema = paginatedResponse(ReminderSchema);
const CustomerPageSchema = paginatedResponse(CustomerSchema);

export { ApiError, extensionErrorMessage };

export async function getStoredToken(): Promise<string | null> {
  const result = await chrome.storage.session.get(TOKEN_STORAGE_KEY);
  return result[TOKEN_STORAGE_KEY] ?? null;
}

export async function setStoredToken(token: string): Promise<void> {
  await chrome.storage.session.set({ [TOKEN_STORAGE_KEY]: token });
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}

export async function getAgentPort(): Promise<number> {
  const result = await chrome.storage.session.get(PORT_STORAGE_KEY);
  return result[PORT_STORAGE_KEY] ?? AGENT_DEFAULT_PORT;
}

export async function setAgentPort(port: number): Promise<void> {
  await chrome.storage.session.set({ [PORT_STORAGE_KEY]: port });
  await chrome.storage.local.remove(PORT_STORAGE_KEY);
}

export async function getWorkbenchOrigin(): Promise<string | undefined> {
  const result = await chrome.storage.session.get(WORKBENCH_ORIGIN_STORAGE_KEY);
  return result[WORKBENCH_ORIGIN_STORAGE_KEY] ?? undefined;
}

export async function setWorkbenchOrigin(origin: string): Promise<void> {
  await chrome.storage.session.set({ [WORKBENCH_ORIGIN_STORAGE_KEY]: origin });
  await chrome.storage.local.remove(WORKBENCH_ORIGIN_STORAGE_KEY);
}

export async function getBaseUrl(): Promise<string> {
  const port = await getAgentPort();
  return `http://127.0.0.1:${port}`;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function statusErrorCode(status: number): string {
  if (status === 400 || status === 422) return API_ERROR_CODES.validation;
  if (status === 401) return API_ERROR_CODES.unauthorized;
  if (status === 403) return API_ERROR_CODES.forbidden;
  if (status === 404) return API_ERROR_CODES.notFound;
  if (status === 409) return API_ERROR_CODES.conflict;
  if (status === 429) return API_ERROR_CODES.rateLimited;
  if (status >= 500) return API_ERROR_CODES.server;
  return API_ERROR_CODES.unknown;
}

function invalidResponse(status: number, cause?: unknown): ApiError {
  return new ApiError({
    code: API_ERROR_CODES.invalidResponse,
    message: "Agent response did not match the API contract",
    status,
    cause,
  });
}

export async function apiFetch<T>(
  path: string,
  parser: z.ZodType<T>,
  options: RequestInit = {},
  idempotency: boolean | string = false,
): Promise<T> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();
  if (idempotency) {
    headers["Idempotency-Key"] = typeof idempotency === "string"
      ? idempotency
      : generateIdempotencyKey();
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new ApiError({
        code: API_ERROR_CODES.aborted,
        message: "Request aborted",
        cause,
      });
    }
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new ApiError({
        code: API_ERROR_CODES.aborted,
        message: "Request aborted",
        cause,
      });
    }
    throw new ApiError({
      code: API_ERROR_CODES.network,
      message: "Unable to reach Agent",
      cause,
    });
  }

  if (response.status === 204) {
    const result = parser.safeParse(undefined);
    if (!result.success) throw invalidResponse(response.status, result.error);
    return result.data;
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (cause) {
    if (response.ok) throw invalidResponse(response.status, cause);
    throw new ApiError({
      code: statusErrorCode(response.status),
      message: "Agent request failed",
      status: response.status,
      cause,
    });
  }

  if (!response.ok) {
    const parsedError = ErrorResponseSchema.safeParse(body);
    if (!parsedError.success) {
      throw new ApiError({
        code: statusErrorCode(response.status),
        message: "Agent request failed",
        status: response.status,
        cause: parsedError.error,
      });
    }
    throw new ApiError({
      code: parsedError.data.error.code,
      message: "Agent request failed",
      status: response.status,
      fields: parsedError.data.error.fields,
      requestId: parsedError.data.error.request_id,
      details: parsedError.data.error.details,
    });
  }

  const successPayload = body && typeof body === "object" && "data" in body
    ? (body as { data: unknown }).data
    : body;
  const result = parser.safeParse(successPayload);
  if (!result.success) throw invalidResponse(response.status, result.error);
  return result.data;
}

export function fetchPopupReminders(signal?: AbortSignal): Promise<PopupReminder[]> {
  return apiFetch(API_PATHS.remindersPopup, PopupReminderSchema.array(), { signal });
}

export async function fetchPendingReminderCount(signal?: AbortSignal): Promise<number> {
  const stats = await apiFetch(API_PATHS.stats, StatsSchema, { signal });
  return stats.pending_reminders + (stats.overdue_reminders ?? 0);
}

export function createCustomer(
  data: CustomerCreate,
  idempotencyKey: string | boolean = true,
): Promise<Customer> {
  return apiFetch(
    API_PATHS.customers,
    CustomerSchema,
    { method: "POST", body: JSON.stringify(data) },
    idempotencyKey,
  );
}

export function fetchCustomerDetail(id: string, signal?: AbortSignal): Promise<CustomerDetail> {
  return apiFetch(API_PATHS.customer(id), CustomerDetailSchema, { signal });
}

export function resolveMatch(
  data: MatchResolve,
  signal?: AbortSignal,
): Promise<MatchResolveResponse> {
  return apiFetch(
    API_PATHS.matchResolve,
    MatchResolveResponseSchema,
    { method: "POST", body: JSON.stringify(data), signal },
  );
}

export function bindMatch(data: MatchBind): Promise<Binding> {
  return apiFetch(
    API_PATHS.matchBind,
    BindingSchema,
    { method: "POST", body: JSON.stringify(data) },
    true,
  );
}

export function unbindMatch(data: MatchUnbind): Promise<void> {
  return apiFetch(
    API_PATHS.matchUnbind,
    z.undefined(),
    { method: "DELETE", body: JSON.stringify(data) },
  );
}

export function searchCustomers(
  search: string,
  signal?: AbortSignal,
): Promise<{ items: Customer[]; next_cursor: string | null }> {
  const query = new URLSearchParams({ search, limit: "10", sort: "name" });
  return apiFetch(`${API_PATHS.customers}?${query.toString()}`, CustomerPageSchema, { signal });
}

export function createFollowUp(
  data: FollowUpCreate,
  idempotencyKey = generateIdempotencyKey(),
): Promise<FollowUp> {
  return apiFetch(
    API_PATHS.followUps,
    FollowUpSchema,
    { method: "POST", body: JSON.stringify(data) },
    idempotencyKey,
  );
}

export function fetchFollowUps(
  customerId: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<{ items: FollowUp[]; next_cursor: string | null }> {
  const query = new URLSearchParams({ customer_id: customerId, limit: String(limit) });
  return apiFetch(`${API_PATHS.followUps}?${query.toString()}`, FollowUpPageSchema, { signal });
}

export function createReminder(data: ReminderCreate): Promise<Reminder> {
  return apiFetch(
    API_PATHS.reminders,
    ReminderSchema,
    { method: "POST", body: JSON.stringify(data) },
    true,
  );
}

export function fetchRemindersByCustomer(
  customerId: string,
  signal?: AbortSignal,
): Promise<{ items: Reminder[]; next_cursor: string | null }> {
  const query = new URLSearchParams({ customer_id: customerId, limit: "10" });
  return apiFetch(`${API_PATHS.reminders}?${query.toString()}`, ReminderPageSchema, { signal });
}

export function updateReminderStatus(
  reminderId: string,
  data: ReminderStatusUpdate,
): Promise<Reminder> {
  return apiFetch(
    API_PATHS.reminder(reminderId),
    ReminderSchema,
    {
      method: "PUT",
      body: JSON.stringify(ReminderStatusUpdateSchema.parse(data)),
    },
  );
}
