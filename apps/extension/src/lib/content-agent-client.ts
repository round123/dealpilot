import { API_ERROR_CODES } from "@dealpilot/api-client/error";
import {
  BindingSchema,
  CustomerSchema,
  FollowUpSchema,
  MatchResolveResponseSchema,
  ReminderSchema,
  ReminderCreateSchema,
  ReminderStatusUpdateSchema,
  paginatedResponse,
  type Binding,
  type Customer,
  type FollowUp,
  type FollowUpCreate,
  type MatchBind,
  type MatchResolve,
  type MatchResolveResponse,
  type MatchUnbind,
  type Reminder,
  type ReminderCreate,
  type ReminderStatusUpdate,
} from "@dealpilot/shared";
import { z } from "zod";
import type { WorkbenchDestination } from "./workbench-links";
import { ApiError, extensionErrorMessage } from "./extension-errors";

export { extensionErrorMessage };

export const CONTENT_AGENT_REQUEST = "CONTENT_AGENT_REQUEST";

export type ContentAgentOperation =
  | "resolve_match"
  | "bind_match"
  | "unbind_match"
  | "search_customers"
  | "fetch_follow_ups"
  | "fetch_customer_reminders"
  | "create_follow_up"
  | "create_reminder"
  | "update_reminder_status"
  | "open_workbench";

export interface ContentAgentRequest {
  type: typeof CONTENT_AGENT_REQUEST;
  operation: ContentAgentOperation;
  payload: unknown;
}

const responseSchema = z.union([
  z.object({ ok: z.literal(true), data: z.unknown().optional() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      status: z.number().int().nonnegative(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
      request_id: z.string().optional(),
    }),
  }),
]);
const followUpPageSchema = paginatedResponse(FollowUpSchema);
const reminderPageSchema = paginatedResponse(ReminderSchema);
const customerPageSchema = paginatedResponse(CustomerSchema);

async function sendContentRequest<T>(
  operation: ContentAgentOperation,
  payload: unknown,
  parser: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw abortedError();

  const raw = await new Promise<unknown>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(abortedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    chrome.runtime.sendMessage(
      { type: CONTENT_AGENT_REQUEST, operation, payload } satisfies ContentAgentRequest,
      (response) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        if (chrome.runtime.lastError) {
          reject(new ApiError({
            code: API_ERROR_CODES.network,
            message: "Background request failed",
          }));
          return;
        }
        resolve(response);
      },
    );
  });

  const envelope = responseSchema.safeParse(raw);
  if (!envelope.success) throw invalidResponse(envelope.error);
  if (!envelope.data.ok) {
    throw new ApiError({
      code: envelope.data.error.code,
      message: "Background request failed",
      status: envelope.data.error.status,
      fields: envelope.data.error.fields,
      requestId: envelope.data.error.request_id,
    });
  }
  const parsed = parser.safeParse(envelope.data.data);
  if (!parsed.success) throw invalidResponse(parsed.error);
  return parsed.data;
}

function abortedError() {
  return new ApiError({ code: API_ERROR_CODES.aborted, message: "Request aborted" });
}

function invalidResponse(cause: unknown) {
  return new ApiError({
    code: API_ERROR_CODES.invalidResponse,
    message: "Background response did not match the contract",
    cause,
  });
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function resolveMatch(data: MatchResolve, signal?: AbortSignal): Promise<MatchResolveResponse> {
  return sendContentRequest("resolve_match", data, MatchResolveResponseSchema, signal);
}

export function bindMatch(data: MatchBind): Promise<Binding> {
  return sendContentRequest("bind_match", data, BindingSchema);
}

export function unbindMatch(data: MatchUnbind): Promise<void> {
  return sendContentRequest("unbind_match", data, z.undefined());
}

export function searchCustomers(search: string, signal?: AbortSignal) {
  return sendContentRequest("search_customers", { search }, customerPageSchema, signal) as Promise<{
    items: Customer[];
    next_cursor: string | null;
  }>;
}

export function fetchFollowUps(customerId: string, limit = 5, signal?: AbortSignal) {
  return sendContentRequest(
    "fetch_follow_ups",
    { customer_id: customerId, limit },
    followUpPageSchema,
    signal,
  ) as Promise<{ items: FollowUp[]; next_cursor: string | null }>;
}

export function fetchRemindersByCustomer(customerId: string, signal?: AbortSignal) {
  return sendContentRequest(
    "fetch_customer_reminders",
    { customer_id: customerId },
    reminderPageSchema,
    signal,
  ) as Promise<{ items: Reminder[]; next_cursor: string | null }>;
}

export function createFollowUp(data: FollowUpCreate, idempotencyKey: string): Promise<FollowUp> {
  return sendContentRequest("create_follow_up", { data, idempotency_key: idempotencyKey }, FollowUpSchema);
}

export async function createReminder(data: ReminderCreate): Promise<Reminder> {
  return sendContentRequest("create_reminder", ReminderCreateSchema.parse(data), ReminderSchema);
}

export async function updateContentReminderStatus(
  reminderId: string,
  data: ReminderStatusUpdate,
): Promise<Reminder> {
  return sendContentRequest(
    "update_reminder_status",
    {
      reminder_id: reminderId,
      data: ReminderStatusUpdateSchema.parse(data),
    },
    ReminderSchema,
  );
}

export function openContentWorkbench(destination: WorkbenchDestination = "home"): Promise<void> {
  return sendContentRequest("open_workbench", { destination }, z.undefined());
}
