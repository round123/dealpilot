import { API_ERROR_CODES } from "@dealpilot/api-client/error";
import {
  FollowUpCreateSchema,
  MatchBindSchema,
  MatchResolveSchema,
  MatchUnbindSchema,
  ReminderCreateSchema,
  ReminderStatusUpdateSchema,
} from "@dealpilot/shared";
import { z } from "zod";
import {
  bindMatch,
  createFollowUp,
  createReminder,
  fetchFollowUps,
  fetchRemindersByCustomer,
  resolveMatch,
  searchCustomers,
  unbindMatch,
  updateReminderStatus,
} from "./api-client";
import {
  CONTENT_AGENT_REQUEST,
  type ContentAgentOperation,
} from "./content-agent-client";
import { ApiError } from "./extension-errors";
import { openWorkbench } from "./workbench-links";

const operationSchema = z.enum([
  "resolve_match",
  "bind_match",
  "unbind_match",
  "search_customers",
  "fetch_follow_ups",
  "fetch_customer_reminders",
  "create_follow_up",
  "create_reminder",
  "update_reminder_status",
  "open_workbench",
] satisfies [ContentAgentOperation, ...ContentAgentOperation[]]);
const requestSchema = z.object({
  type: z.literal(CONTENT_AGENT_REQUEST),
  operation: operationSchema,
  payload: z.unknown(),
});
const customerQuerySchema = z.object({ search: z.string().trim().min(1).max(200) });
const customerResourceQuerySchema = z.object({
  customer_id: z.string().uuid(),
  limit: z.number().int().min(1).max(20).optional(),
});
const followUpCommandSchema = z.object({
  data: FollowUpCreateSchema,
  idempotency_key: z.string().min(8).max(200),
});
const reminderStatusCommandSchema = z.object({
  reminder_id: z.string().uuid(),
  data: ReminderStatusUpdateSchema,
});
const destinationSchema = z.union([
  z.enum(["home", "customers", "new-customer", "reminders", "projects"]),
  z.object({ customerId: z.string().min(1).max(200) }),
]);

export interface ContentMessageSender {
  id?: string;
  url?: string;
  tab?: { id?: number; url?: string };
}

export function isAllowedContentSender(sender: ContentMessageSender): boolean {
  if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined) return false;
  const value = sender.url ?? sender.tab.url;
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "web.whatsapp.com" || url.hostname === "web.telegram.org");
  } catch {
    return false;
  }
}

export async function handleContentAgentRequest(
  message: unknown,
  sender: ContentMessageSender,
) {
  if (!isAllowedContentSender(sender)) {
    return failure(API_ERROR_CODES.forbidden, 403);
  }

  const parsed = requestSchema.safeParse(message);
  if (!parsed.success) return failure(API_ERROR_CODES.validation, 400);

  try {
    return { ok: true as const, data: await dispatch(parsed.data.operation, parsed.data.payload) };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false as const,
        error: {
          code: error.code,
          status: error.status,
          ...(error.fields ? { fields: error.fields } : {}),
          request_id: error.requestId,
        },
      };
    }
    return failure(
      error instanceof z.ZodError ? API_ERROR_CODES.validation : API_ERROR_CODES.unknown,
      error instanceof z.ZodError ? 400 : 0,
    );
  }
}

async function dispatch(operation: ContentAgentOperation, payload: unknown) {
  switch (operation) {
    case "resolve_match":
      return resolveMatch(MatchResolveSchema.parse(payload));
    case "bind_match":
      return bindMatch(MatchBindSchema.parse(payload));
    case "unbind_match":
      return unbindMatch(MatchUnbindSchema.parse(payload));
    case "search_customers":
      return searchCustomers(customerQuerySchema.parse(payload).search);
    case "fetch_follow_ups": {
      const query = customerResourceQuerySchema.parse(payload);
      return fetchFollowUps(query.customer_id, query.limit ?? 5);
    }
    case "fetch_customer_reminders":
      return fetchRemindersByCustomer(customerResourceQuerySchema.parse(payload).customer_id);
    case "create_follow_up": {
      const command = followUpCommandSchema.parse(payload);
      return createFollowUp(command.data, command.idempotency_key);
    }
    case "create_reminder":
      return createReminder(ReminderCreateSchema.parse(payload));
    case "update_reminder_status": {
      const command = reminderStatusCommandSchema.parse(payload);
      return updateReminderStatus(command.reminder_id, command.data);
    }
    case "open_workbench":
      return openWorkbench(z.object({ destination: destinationSchema }).parse(payload).destination);
  }
}

function failure(code: string, status: number) {
  return { ok: false as const, error: { code, status } };
}
