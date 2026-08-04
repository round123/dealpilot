import {
  API_ERROR_CODES,
  ApiError,
  createApiClient,
  ReminderIdSchema,
  type ApiClient,
  type AuthSession,
  type AuthSubscription,
} from "@dealpilot/api-client";
import {
  BindingSchema,
  CustomerDetailSchema,
  CustomerSchema,
  FollowUpSchema,
  MatchMethod,
  MatchResolveResponseSchema,
  MatchStatus,
  POPUP_REMINDER_LIMIT,
  PopupReminderSchema,
  ReminderSchema,
  type Binding,
  type Customer,
  type CustomerCreate,
  type CustomerDetail,
  type FollowUp,
  type FollowUpCreate,
  type MatchBind,
  type MatchResolve,
  type MatchResolveResponse,
  type MatchUnbind,
  type PopupReminder,
  type Reminder,
  type ReminderCreate,
  type ReminderStatusUpdate,
} from "@dealpilot/shared";
import { z } from "zod";

import { extensionErrorMessage } from "./extension-errors";
import { canonicalPlatformIdentifier } from "./platform-identity";

const CloudConfigSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(1),
});

const CloudSocialAccountSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable().optional(),
  platform: z.string().min(1),
  raw_identifier: z.string().min(1),
  normalized_identifier: z.string().min(1),
  manually_bound: z.boolean(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});

const CloudFollowUpSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  deal_id: z.string().uuid().nullable(),
  type: z.string(),
  note: z.string().nullable(),
  message_body: z.string().nullable(),
  message_direction: z.string().nullable(),
  occurred_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
const CloudFollowUpRpcSchema = CloudFollowUpSchema.strict();

const CloudReminderSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  deal_id: z.string().uuid().nullable(),
  type: z.string(),
  status: z.string(),
  due_at: z.string(),
  priority: z.string(),
  last_notified_at: z.string().nullable(),
  snooze_until: z.string().nullable(),
  resolution: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const CloudDealSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  name: z.string(),
});

const CloudRiskSchema = z.object({
  id: z.string().uuid(),
  deal_id: z.string().uuid(),
  severity: z.string(),
  status: z.string(),
});

let apiClient: ApiClient | undefined;

export { ApiError, extensionErrorMessage };

const chromeAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await chrome.storage.local.get(key);
    return typeof result[key] === "string" ? result[key] : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};

function createConfiguredClient(): ApiClient {
  const config = CloudConfigSchema.safeParse({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
  });
  if (!config.success) {
    throw new ApiError({
      code: API_ERROR_CODES.invalidResponse,
      message: "Extension Cloud API configuration is missing or invalid",
      cause: config.error,
    });
  }

  return createApiClient({
    ...config.data,
    options: {
      auth: {
        storage: chromeAuthStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    },
  });
}

export function getExtensionApiClient(): ApiClient {
  apiClient ??= createConfiguredClient();
  return apiClient;
}

/** Test seam for the network boundary. Production code never supplies a client. */
export function setExtensionApiClient(client?: ApiClient): void {
  apiClient = client;
}

export function signInToCloud(
  email: string,
  password: string,
): Promise<AuthSession> {
  return getExtensionApiClient().auth.signInWithPassword(email, password);
}

export function signOutFromCloud(): Promise<void> {
  return getExtensionApiClient().auth.signOut();
}

export function getCloudSession(
  signal?: AbortSignal,
): Promise<AuthSession | null> {
  return getExtensionApiClient().auth.getSession({ signal });
}

export function onCloudAuthStateChange(
  listener: (session: AuthSession | null) => void,
): AuthSubscription {
  return getExtensionApiClient().auth.onAuthStateChange((_event, session) => {
    listener(session);
  });
}

async function authenticatedClient(signal?: AbortSignal): Promise<ApiClient> {
  const client = getExtensionApiClient();
  if (!(await client.auth.getSession({ signal }))) {
    throw new ApiError({
      code: API_ERROR_CODES.unauthorized,
      message: "A Cloud session is required",
      status: 401,
    });
  }
  return client;
}

function parseDomain<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError({
      code: API_ERROR_CODES.invalidResponse,
      message: "Cloud data did not match the extension contract",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function toFollowUp(value: z.infer<typeof CloudFollowUpSchema>): FollowUp {
  return parseDomain(FollowUpSchema, {
    ...value,
    customer_id: value.company_id,
    project_id: value.deal_id,
  });
}

function toReminder(value: z.infer<typeof CloudReminderSchema>): Reminder {
  return parseDomain(ReminderSchema, {
    ...value,
    customer_id: value.company_id,
    project_id: value.deal_id,
    completed_at: value.status === "completed" ? value.updated_at : null,
    pause_reason: value.type === "paused" ? value.resolution : null,
    reevaluate_at: value.type === "paused" ? value.snooze_until : null,
  });
}

function toBinding(value: z.infer<typeof CloudSocialAccountSchema>): Binding {
  return parseDomain(BindingSchema, {
    ...value,
    customer_id: value.company_id,
  });
}

async function matchingAccounts(
  client: ApiClient,
  platform: MatchResolve["platform"],
  rawIdentifier: string,
  signal?: AbortSignal,
) {
  const result = await client.list(
    "social_accounts",
    CloudSocialAccountSchema,
    {
      filters: { platform },
      pagination: { page: 1, perPage: 1000 },
      signal,
    },
  );
  const identifier = canonicalPlatformIdentifier(platform, rawIdentifier);
  return result.data.filter(
    (account) =>
      canonicalPlatformIdentifier(platform, account.normalized_identifier) ===
        identifier ||
      canonicalPlatformIdentifier(platform, account.raw_identifier) ===
        identifier,
  );
}

export async function fetchPopupReminders(
  signal?: AbortSignal,
): Promise<PopupReminder[]> {
  const client = await authenticatedClient(signal);
  const reminderResult = await client.list("reminders", CloudReminderSchema, {
    filters: { status: ["pending", "snoozed"] },
    sort: { field: "due_at", order: "asc" },
    pagination: { page: 1, perPage: 100 },
    signal,
  });
  if (reminderResult.data.length === 0) return [];

  const customerIds = [
    ...new Set(reminderResult.data.map((item) => item.company_id)),
  ];
  const dealIds = [
    ...new Set(
      reminderResult.data
        .map((item) => item.deal_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const [customers, deals, risks, accounts] = await Promise.all([
    client.list("companies", CustomerSchema, {
      filters: { id: customerIds },
      pagination: { page: 1, perPage: Math.max(customerIds.length, 1) },
      signal,
    }),
    dealIds.length
      ? client.list("deals", CloudDealSchema, {
          filters: { id: dealIds },
          pagination: { page: 1, perPage: dealIds.length },
          signal,
        })
      : Promise.resolve({ data: [], total: 0 }),
    dealIds.length
      ? client.list("deal_risks", CloudRiskSchema, {
          filters: { deal_id: dealIds, status: ["open", "handling"] },
          pagination: { page: 1, perPage: 1000 },
          signal,
        })
      : Promise.resolve({ data: [], total: 0 }),
    client.list("social_accounts", CloudSocialAccountSchema, {
      filters: { company_id: customerIds, platform: ["whatsapp", "telegram"] },
      sort: { field: "manually_bound", order: "desc" },
      pagination: { page: 1, perPage: 1000 },
      signal,
    }),
  ]);

  const customerById = new Map(customers.data.map((item) => [item.id, item]));
  const dealById = new Map(deals.data.map((item) => [item.id, item]));
  const highRiskDeals = new Set(
    risks.data
      .filter(
        (item) => item.severity === "high" || item.severity === "critical",
      )
      .map((item) => item.deal_id),
  );
  const accountByCustomer = new Map<
    string,
    z.infer<typeof CloudSocialAccountSchema>
  >();
  for (const account of accounts.data) {
    if (!accountByCustomer.has(account.company_id)) {
      accountByCustomer.set(account.company_id, account);
    }
  }

  return reminderResult.data
    .map((item) => {
      const customer = customerById.get(item.company_id);
      if (!customer) return null;
      const account = accountByCustomer.get(item.company_id);
      return parseDomain(PopupReminderSchema, {
        ...toReminder(item),
        customer_name: customer.name,
        project_name: item.deal_id
          ? (dealById.get(item.deal_id)?.name ?? null)
          : null,
        has_high_risk: item.deal_id ? highRiskDeals.has(item.deal_id) : false,
        conversation_target: account
          ? {
              platform: account.platform,
              raw_identifier: account.raw_identifier,
            }
          : null,
      });
    })
    .filter((item): item is PopupReminder => item !== null)
    .slice(0, POPUP_REMINDER_LIMIT);
}

export async function fetchPendingReminderCount(
  signal?: AbortSignal,
): Promise<number> {
  const client = await authenticatedClient(signal);
  const result = await client.list("reminders", CloudReminderSchema, {
    filters: { status: ["pending", "snoozed"] },
    pagination: { page: 1, perPage: 1 },
    signal,
  });
  return result.total;
}

export async function createCustomer(
  data: CustomerCreate,
  _idempotencyKey: string | boolean = true,
): Promise<Customer> {
  void _idempotencyKey;
  const client = await authenticatedClient();
  return client.create("companies", data, CustomerSchema);
}

export async function fetchCustomerDetail(
  id: string,
  signal?: AbortSignal,
): Promise<CustomerDetail> {
  const client = await authenticatedClient(signal);
  const detail = await client.customers.getCustomerDetail(id as never, {
    signal,
  });
  return parseDomain(CustomerDetailSchema, {
    ...detail,
    contacts: detail.contacts.map((contact) => ({
      id: contact.id,
      name:
        contact.name ??
        [contact.first_name, contact.last_name].filter(Boolean).join(" "),
      title: contact.title,
      email: firstJsonField(contact.email_jsonb, "email"),
      phone: firstJsonField(contact.phone_jsonb, "number"),
    })),
    social_accounts: detail.social_accounts,
    recent_follow_ups: detail.recent_follow_ups,
    open_reminders: detail.open_reminders,
    projects: detail.deals,
  });
}

function firstJsonField(
  values: readonly unknown[],
  field: string,
): string | null {
  for (const value of values) {
    if (typeof value === "object" && value !== null && field in value) {
      const candidate = (value as Record<string, unknown>)[field];
      if (typeof candidate === "string") return candidate;
    }
  }
  return null;
}

export async function resolveMatch(
  data: MatchResolve,
  signal?: AbortSignal,
): Promise<MatchResolveResponse> {
  const client = await authenticatedClient(signal);
  const accounts = await matchingAccounts(
    client,
    data.platform,
    data.raw_identifier,
    signal,
  );
  const preferred = accounts.filter((account) => account.manually_bound);
  const selectedAccounts = preferred.length === 1 ? preferred : accounts;
  const customerIds = [
    ...new Set(selectedAccounts.map((account) => account.company_id)),
  ];
  if (customerIds.length === 0) {
    return { status: MatchStatus.NONE, match_method: null };
  }

  const result = await client.list("companies", CustomerSchema, {
    filters: { id: customerIds, deleted_at: null },
    sort: { field: "name", order: "asc" },
    pagination: { page: 1, perPage: customerIds.length },
    signal,
  });
  const matchMethod = preferred.length
    ? MatchMethod.MANUAL
    : data.platform === "whatsapp"
      ? MatchMethod.PHONE
      : MatchMethod.PLATFORM;
  return parseDomain(
    MatchResolveResponseSchema,
    result.data.length === 1
      ? {
          status: MatchStatus.UNIQUE,
          match_method: matchMethod,
          customer: result.data[0],
        }
      : {
          status: MatchStatus.MULTIPLE,
          match_method: matchMethod,
          candidates: result.data,
        },
  );
}

export async function bindMatch(data: MatchBind): Promise<Binding> {
  const client = await authenticatedClient();
  const normalized = canonicalPlatformIdentifier(
    data.platform,
    data.raw_identifier,
  );
  const accounts = await matchingAccounts(
    client,
    data.platform,
    data.raw_identifier,
  );
  const exact = accounts.find(
    (account) =>
      canonicalPlatformIdentifier(
        data.platform,
        account.normalized_identifier,
      ) === normalized,
  );
  const input = {
    company_id: data.customer_id,
    contact_id: null,
    platform: data.platform,
    raw_identifier: data.raw_identifier.trim(),
    normalized_identifier: normalized,
    manually_bound: true,
  };
  const account = exact
    ? await client.update(
        "social_accounts",
        exact.id,
        input,
        CloudSocialAccountSchema,
      )
    : await client.create("social_accounts", input, CloudSocialAccountSchema);
  return toBinding(account);
}

export async function unbindMatch(data: MatchUnbind): Promise<void> {
  const client = await authenticatedClient();
  const accounts = await matchingAccounts(
    client,
    data.platform,
    data.raw_identifier,
  );
  const manual = accounts.find((account) => account.manually_bound);
  if (manual) {
    await client.delete("social_accounts", manual.id, CloudSocialAccountSchema);
  }
}

export async function searchCustomers(
  search: string,
  signal?: AbortSignal,
): Promise<{ items: Customer[]; next_cursor: string | null }> {
  const client = await authenticatedClient(signal);
  const result = await client.list("companies_summary", CustomerSchema, {
    filters: {
      search_text: { operator: "ilike", value: `%${search.trim()}%` },
      deleted_at: null,
    },
    sort: { field: "name", order: "asc" },
    pagination: { page: 1, perPage: 10 },
    signal,
  });
  return { items: result.data, next_cursor: null };
}

export async function createFollowUp(
  data: FollowUpCreate,
  idempotencyKey = generateIdempotencyKey(),
): Promise<FollowUp> {
  const client = await authenticatedClient();
  const parsedKey = z.string().uuid().parse(idempotencyKey);
  const value = await client.rpc(
    "create_follow_up_idempotent",
    {
      p_idempotency_key: parsedKey,
      p_company_id: data.customer_id,
      p_deal_id: data.project_id ?? null,
      p_type: data.type,
      p_note: data.note ?? null,
      p_message_body: data.message_body ?? null,
      p_message_direction: data.message_direction ?? null,
      p_occurred_at: data.occurred_at,
    },
    CloudFollowUpRpcSchema,
  );
  return toFollowUp(value);
}

export async function fetchFollowUps(
  customerId: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<{ items: FollowUp[]; next_cursor: string | null }> {
  const client = await authenticatedClient(signal);
  const result = await client.list("follow_ups", CloudFollowUpSchema, {
    filters: { company_id: customerId },
    sort: { field: "occurred_at", order: "desc" },
    pagination: { page: 1, perPage: limit },
    signal,
  });
  return { items: result.data.map(toFollowUp), next_cursor: null };
}

export async function createReminder(data: ReminderCreate): Promise<Reminder> {
  const client = await authenticatedClient();
  const dueAt =
    data.due_at ??
    data.reevaluate_at ??
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const value = await client.create(
    "reminders",
    {
      company_id: data.customer_id,
      deal_id: data.project_id ?? null,
      type: data.type,
      status: "pending",
      due_at: dueAt,
      priority: data.priority,
      snooze_until:
        data.type === "paused" ? (data.reevaluate_at ?? null) : null,
      resolution: data.type === "paused" ? (data.pause_reason ?? null) : null,
    },
    CloudReminderSchema,
  );
  return toReminder(value);
}

export async function fetchRemindersByCustomer(
  customerId: string,
  signal?: AbortSignal,
): Promise<{ items: Reminder[]; next_cursor: string | null }> {
  const client = await authenticatedClient(signal);
  const result = await client.list("reminders", CloudReminderSchema, {
    filters: { company_id: customerId, status: ["pending", "snoozed"] },
    sort: { field: "due_at", order: "asc" },
    pagination: { page: 1, perPage: 10 },
    signal,
  });
  return { items: result.data.map(toReminder), next_cursor: null };
}

export async function updateReminderStatus(
  reminderId: string,
  data: ReminderStatusUpdate,
  idempotencyKey: string,
): Promise<Reminder> {
  const client = await authenticatedClient();
  const value = await client.reminders.updateStatus({
    reminderId: ReminderIdSchema.parse(reminderId),
    idempotencyKey,
    status: data.status,
    snoozeUntil: data.snooze_until,
    resolution: data.resolution,
  });
  return toReminder(value);
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
