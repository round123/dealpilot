import { z } from "zod";
import { parseData } from "./contracts.js";
import { API_ERROR_CODES, ApiError } from "./error.js";
import type { ApiClient, ApiRequestOptions } from "./gateway.js";
import {
  ContactIdSchema,
  CustomerIdSchema,
  DealIdSchema,
  FollowUpIdSchema,
  ReminderIdSchema,
  SocialAccountIdSchema,
  UserIdSchema,
} from "./ids.js";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

const DateTimeSchema = z.string().datetime({ offset: true });
const NullableTextSchema = z.string().nullable();

export const DEAL_STAGE_VALUES = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
  "archived",
] as const;

export const DealStageSchema = z.enum(DEAL_STAGE_VALUES);

export const CustomerSchema = z
  .object({
    id: CustomerIdSchema,
    owner_user_id: UserIdSchema,
    name: z.string().min(1),
    company: NullableTextSchema,
    sector: NullableTextSchema,
    size: z.number().int().nonnegative().nullable(),
    linkedin_url: NullableTextSchema,
    website: NullableTextSchema,
    phone_number: NullableTextSchema,
    address: NullableTextSchema,
    zipcode: NullableTextSchema,
    city: NullableTextSchema,
    state_abbr: NullableTextSchema,
    country: NullableTextSchema,
    description: NullableTextSchema,
    revenue: NullableTextSchema,
    tax_identifier: NullableTextSchema,
    logo: JsonValueSchema,
    context_links: z.array(z.string()),
    source: NullableTextSchema,
    grade: z.enum(["A", "B", "C"]),
    status: z.enum(["active", "inactive"]),
    deleted_at: DateTimeSchema.nullable(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })
  .strict();

export const CustomerContactSchema = z
  .object({
    id: ContactIdSchema,
    owner_user_id: UserIdSchema,
    company_id: CustomerIdSchema,
    first_name: NullableTextSchema,
    last_name: NullableTextSchema,
    name: NullableTextSchema,
    gender: NullableTextSchema,
    title: NullableTextSchema,
    background: NullableTextSchema,
    avatar: JsonValueSchema,
    first_seen: DateTimeSchema.nullable(),
    last_seen: DateTimeSchema.nullable(),
    has_newsletter: z.boolean(),
    status: NullableTextSchema,
    linkedin_url: NullableTextSchema,
    email_jsonb: z.array(JsonValueSchema),
    phone_jsonb: z.array(JsonValueSchema),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })
  .strict();

export const CustomerSocialAccountSchema = z
  .object({
    id: SocialAccountIdSchema,
    owner_user_id: UserIdSchema,
    company_id: CustomerIdSchema,
    contact_id: ContactIdSchema.nullable(),
    platform: z.string().min(1),
    raw_identifier: z.string().min(1),
    normalized_identifier: z.string().min(1),
    manually_bound: z.boolean(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })
  .strict();

export const CustomerDealSchema = z
  .object({
    id: DealIdSchema,
    owner_user_id: UserIdSchema,
    company_id: CustomerIdSchema,
    name: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, {
        message: "Deal name cannot be blank",
      }),
    category: NullableTextSchema,
    stage: DealStageSchema,
    grade: z.enum(["S", "A", "B", "C"]),
    description: NullableTextSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    amount: z.number().nonnegative().nullable(),
    probability: z.number().int().min(0).max(100).nullable(),
    expected_closing_date: z.string().date().nullable(),
    closed_reason: NullableTextSchema,
    archived_at: DateTimeSchema.nullable(),
    sort_index: z.number().int().min(-32_768).max(32_767).nullable(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })
  .strict();

export const CustomerFollowUpSchema = z
  .object({
    id: FollowUpIdSchema,
    owner_user_id: UserIdSchema,
    company_id: CustomerIdSchema,
    deal_id: DealIdSchema.nullable(),
    type: z.enum(["call", "email", "chat", "visit", "note", "message"]),
    note: NullableTextSchema,
    message_body: NullableTextSchema,
    message_direction: z.enum(["inbound", "outbound"]).nullable(),
    occurred_at: DateTimeSchema,
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })
  .strict();

export const CustomerReminderSchema = z
  .object({
    id: ReminderIdSchema,
    owner_user_id: UserIdSchema,
    company_id: CustomerIdSchema,
    deal_id: DealIdSchema.nullable(),
    type: z.enum(["fixed_time", "waiting_reply", "paused"]),
    status: z.enum([
      "pending",
      "completed",
      "snoozed",
      "ignored",
      "overdue",
      "replied",
    ]),
    due_at: DateTimeSchema,
    priority: z.enum(["low", "normal", "high", "urgent"]),
    last_notified_at: DateTimeSchema.nullable(),
    snooze_until: DateTimeSchema.nullable(),
    resolution: NullableTextSchema,
    deletion_event_id: z.string().uuid().nullable(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  })
  .strict();

const FollowUpInputShape = z.object({
  company_id: CustomerIdSchema,
  deal_id: DealIdSchema.nullable().optional(),
  type: z.enum(["call", "email", "chat", "visit", "note", "message"]),
  note: NullableTextSchema.optional(),
  message_body: NullableTextSchema.optional(),
  message_direction: z.enum(["inbound", "outbound"]).nullable().optional(),
  occurred_at: DateTimeSchema,
});

const validateMessageFollowUp = (
  value: {
    type?: string;
    message_body?: string | null;
    message_direction?: string | null;
  },
  context: z.RefinementCtx,
) => {
  if (value.type !== "message") return;
  if (!value.message_body?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["message_body"],
      message: "Message follow-up requires message_body",
    });
  }
  if (!value.message_direction) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["message_direction"],
      message: "Message follow-up requires message_direction",
    });
  }
};

export const FollowUpCreateInputSchema =
  FollowUpInputShape.strict().superRefine(validateMessageFollowUp);

export const FollowUpUpdateInputSchema = FollowUpInputShape.partial()
  .strict()
  .superRefine(validateMessageFollowUp);

const ReminderInputShape = z.object({
  company_id: CustomerIdSchema,
  deal_id: DealIdSchema.nullable().optional(),
  type: z.enum(["fixed_time", "waiting_reply", "paused"]),
  status: z
    .enum(["pending", "completed", "snoozed", "ignored", "overdue", "replied"])
    .optional(),
  due_at: DateTimeSchema,
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  last_notified_at: DateTimeSchema.nullable().optional(),
  snooze_until: DateTimeSchema.nullable().optional(),
  resolution: NullableTextSchema.optional(),
});

export const ReminderCreateInputSchema = ReminderInputShape.strict();
export const ReminderUpdateInputSchema = ReminderInputShape.partial().strict();

export const CustomerDetailSchema = CustomerSchema.extend({
  contacts: z.array(CustomerContactSchema),
  social_accounts: z.array(CustomerSocialAccountSchema),
  deals: z.array(CustomerDealSchema),
  recent_follow_ups: z.array(CustomerFollowUpSchema).max(10),
  open_reminders: z.array(CustomerReminderSchema),
}).strict();

export const CustomerSummarySchema = CustomerSchema.extend({
  sales_id: UserIdSchema,
  nb_contacts: z.number().int().nonnegative(),
  nb_deals: z.number().int().nonnegative(),
  search_text: z.string(),
}).strict();

export const CustomerCursorSortFieldSchema = z.enum([
  "name",
  "created_at",
  "updated_at",
  "grade",
]);

export const CustomerCursorPageInputSchema = z
  .object({
    cursor: z.string().min(1).nullable().optional(),
    limit: z.number().int().min(1).max(100),
    search: z.string().trim().max(200).nullable().optional(),
    grade: z.enum(["A", "B", "C"]).nullable().optional(),
    status: z.enum(["active", "inactive"]).nullable().optional(),
    sortField: CustomerCursorSortFieldSchema,
    sortOrder: z.enum(["asc", "desc"]),
  })
  .strict();

export const CustomerCursorPageSchema = z
  .object({
    items: z.array(CustomerSummarySchema),
    next_cursor: z.string().min(1).nullable(),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const ResolvedCustomerMergeFieldsSchema = z
  .object({
    name: z.string().min(1),
    company: NullableTextSchema,
    country: NullableTextSchema,
    source: NullableTextSchema,
    grade: z.enum(["A", "B", "C"]),
    status: z.enum(["active", "inactive"]),
  })
  .strict();

export const CustomerMergeFieldResolutionsSchema =
  ResolvedCustomerMergeFieldsSchema.partial();

export const CustomerMergeChoiceSchema = z.enum(["source", "target"]);

export const CustomerMergeChoicesSchema = z
  .object({
    name: CustomerMergeChoiceSchema,
    company: CustomerMergeChoiceSchema,
    country: CustomerMergeChoiceSchema,
    source: CustomerMergeChoiceSchema,
    grade: CustomerMergeChoiceSchema,
    status: CustomerMergeChoiceSchema,
  })
  .partial()
  .strict();

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerContact = z.infer<typeof CustomerContactSchema>;
export type CustomerSocialAccount = z.infer<typeof CustomerSocialAccountSchema>;
export type DealStage = z.infer<typeof DealStageSchema>;
export type CustomerDeal = z.infer<typeof CustomerDealSchema>;
export type CustomerFollowUp = z.infer<typeof CustomerFollowUpSchema>;
export type CustomerReminder = z.infer<typeof CustomerReminderSchema>;
export type FollowUpCreateInput = z.infer<typeof FollowUpCreateInputSchema>;
export type FollowUpUpdateInput = z.infer<typeof FollowUpUpdateInputSchema>;
export type ReminderCreateInput = z.infer<typeof ReminderCreateInputSchema>;
export type ReminderUpdateInput = z.infer<typeof ReminderUpdateInputSchema>;
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;
export type CustomerSummary = z.infer<typeof CustomerSummarySchema>;
export type CustomerCursorSortField = z.infer<
  typeof CustomerCursorSortFieldSchema
>;
export type CustomerCursorPageInput = z.infer<
  typeof CustomerCursorPageInputSchema
>;
export type CustomerCursorPage = z.infer<typeof CustomerCursorPageSchema>;
export type CustomerMergeFieldResolutions = z.infer<
  typeof CustomerMergeFieldResolutionsSchema
>;
export type ResolvedCustomerMergeFields = z.infer<
  typeof ResolvedCustomerMergeFieldsSchema
>;
export type CustomerMergeChoice = z.infer<typeof CustomerMergeChoiceSchema>;
export type CustomerMergeChoices = z.infer<typeof CustomerMergeChoicesSchema>;

/** Omitted choices intentionally keep the target Customer's field value. */
export function resolveCustomerMergeFields(
  sourceCustomer: Customer,
  targetCustomer: Customer,
  choices: CustomerMergeChoices,
): ResolvedCustomerMergeFields {
  const parsedChoices = CustomerMergeChoicesSchema.parse(choices);
  const selectCustomer = (field: keyof CustomerMergeChoices) =>
    parsedChoices[field] === "source" ? sourceCustomer : targetCustomer;

  return ResolvedCustomerMergeFieldsSchema.parse({
    name: selectCustomer("name").name,
    company: selectCustomer("company").company,
    country: selectCustomer("country").country,
    source: selectCustomer("source").source,
    grade: selectCustomer("grade").grade,
    status: selectCustomer("status").status,
  });
}

export interface MergeCustomersInput {
  sourceId: Customer["id"];
  targetId: Customer["id"];
  fieldResolutions?: CustomerMergeFieldResolutions;
}

export interface CustomerApi {
  listCustomers(
    input: CustomerCursorPageInput,
    options?: ApiRequestOptions,
  ): Promise<CustomerCursorPage>;
  getCustomerDetail(
    id: Customer["id"],
    options?: ApiRequestOptions,
  ): Promise<CustomerDetail>;
  softDeleteCustomer(
    id: Customer["id"],
    options?: ApiRequestOptions,
  ): Promise<Customer>;
  restoreCustomer(
    id: Customer["id"],
    options?: ApiRequestOptions,
  ): Promise<Customer>;
  mergeCustomers(
    input: MergeCustomersInput,
    options?: ApiRequestOptions,
  ): Promise<Customer>;
  mergeContacts(
    sourceId: CustomerContact["id"],
    targetId: CustomerContact["id"],
    options?: ApiRequestOptions,
  ): Promise<CustomerContact>;
}

type CustomerRpcClient = Pick<ApiClient, "rpc">;

async function callCustomerRpc<Schema extends z.ZodTypeAny>(
  client: CustomerRpcClient,
  functionName: string,
  args: Record<string, unknown>,
  schema: Schema,
  options?: ApiRequestOptions,
): Promise<z.output<Schema>> {
  const value = await client.rpc(functionName, args, z.unknown(), options);
  return parseData(schema, value) as z.output<Schema>;
}

export function createCustomerApi(client: CustomerRpcClient): CustomerApi {
  return {
    async listCustomers(input, options) {
      const parsed = CustomerCursorPageInputSchema.safeParse(input);
      if (!parsed.success) {
        const fields: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path.join(".") || "request";
          (fields[field] ??= []).push(issue.message);
        }
        throw new ApiError({
          code: API_ERROR_CODES.validation,
          message: "Invalid Customer cursor query",
          fields,
          details: parsed.error.issues,
          cause: parsed.error,
        });
      }
      return await callCustomerRpc(
        client,
        "list_customers_cursor",
        {
          p_cursor: parsed.data.cursor ?? null,
          p_limit: parsed.data.limit,
          p_search: parsed.data.search?.trim() || null,
          p_grade: parsed.data.grade ?? null,
          p_status: parsed.data.status ?? null,
          p_sort_field: parsed.data.sortField,
          p_sort_order: parsed.data.sortOrder,
        },
        CustomerCursorPageSchema,
        options,
      );
    },

    getCustomerDetail(id, options) {
      return callCustomerRpc(
        client,
        "get_customer_detail",
        { p_customer_id: id },
        CustomerDetailSchema,
        options,
      );
    },

    softDeleteCustomer(id, options) {
      return callCustomerRpc(
        client,
        "soft_delete_customer",
        { p_customer_id: id },
        CustomerSchema,
        options,
      );
    },

    restoreCustomer(id, options) {
      return callCustomerRpc(
        client,
        "restore_customer",
        { p_customer_id: id },
        CustomerSchema,
        options,
      );
    },

    mergeCustomers(input, options) {
      return callCustomerRpc(
        client,
        "merge_customers",
        {
          p_source_id: input.sourceId,
          p_target_id: input.targetId,
          p_field_resolutions: input.fieldResolutions ?? {},
        },
        CustomerSchema,
        options,
      );
    },

    mergeContacts(sourceId, targetId, options) {
      return callCustomerRpc(
        client,
        "merge_contacts",
        {
          p_source_id: sourceId,
          p_target_id: targetId,
        },
        CustomerContactSchema,
        options,
      );
    },
  };
}
