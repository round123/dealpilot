import { z } from "zod";

import {
  CustomerContactSchema,
  CustomerDealSchema,
  CustomerFollowUpSchema,
  CustomerReminderSchema,
  CustomerSchema,
  CustomerSocialAccountSchema,
  CustomerSummarySchema,
  JsonValueSchema,
} from "./customer.js";
import { DealMilestoneSchema, DealRiskSchema } from "./deal-domain.js";
import {
  ContactIdSchema,
  CustomerIdSchema,
  DealIdSchema,
  UserIdSchema,
} from "./ids.js";

const DateTimeSchema = z.string().datetime({ offset: true });
const NullableTextSchema = z.string().nullable();

const ContactWriteShape = z.object({
  company_id: CustomerIdSchema,
  first_name: NullableTextSchema.optional(),
  last_name: NullableTextSchema.optional(),
  name: NullableTextSchema.optional(),
  gender: NullableTextSchema.optional(),
  title: NullableTextSchema.optional(),
  background: NullableTextSchema.optional(),
  avatar: JsonValueSchema.optional(),
  first_seen: DateTimeSchema.nullable().optional(),
  last_seen: DateTimeSchema.nullable().optional(),
  has_newsletter: z.boolean().optional(),
  status: NullableTextSchema.optional(),
  linkedin_url: NullableTextSchema.optional(),
  email_jsonb: z.array(JsonValueSchema),
  phone_jsonb: z.array(JsonValueSchema),
});

export const ContactCreateInputSchema = ContactWriteShape.strict();
export const ContactUpdateInputSchema = ContactWriteShape.partial().strict();
export const ContactTagIdsSchema = z.array(z.string().uuid());

export const ContactTagSchema = z
  .object({
    owner_user_id: UserIdSchema,
    contact_id: ContactIdSchema,
    tag_id: z.string().uuid(),
    created_at: DateTimeSchema,
  })
  .strict();

const CONTACT_WRITE_FIELDS = Object.freeze([
  "company_id",
  "first_name",
  "last_name",
  "name",
  "gender",
  "title",
  "background",
  "avatar",
  "first_seen",
  "last_seen",
  "has_newsletter",
  "status",
  "linkedin_url",
  "email_jsonb",
  "phone_jsonb",
] as const);

const projectContactWriteFields = (input: Readonly<Record<string, unknown>>) =>
  Object.fromEntries(
    CONTACT_WRITE_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(input, field),
    ).map((field) => [field, input[field]]),
  );

export const toContactCreateInput = (
  input: Readonly<Record<string, unknown>>,
) =>
  ContactCreateInputSchema.parse({
    ...projectContactWriteFields(input),
    email_jsonb: input.email_jsonb ?? [],
    phone_jsonb: input.phone_jsonb ?? [],
  });

export const toContactUpdateInput = (
  input: Readonly<Record<string, unknown>>,
) => {
  const projected = projectContactWriteFields(input);
  if (Object.prototype.hasOwnProperty.call(input, "email_jsonb")) {
    projected.email_jsonb = input.email_jsonb ?? [];
  }
  if (Object.prototype.hasOwnProperty.call(input, "phone_jsonb")) {
    projected.phone_jsonb = input.phone_jsonb ?? [];
  }
  return ContactUpdateInputSchema.parse(projected);
};

export const ContactSummarySchema = CustomerContactSchema.extend({
  sales_id: UserIdSchema,
  company_name: z.string().min(1),
  tags: z.array(z.string().uuid()),
  nb_tasks: z.number().int().nonnegative(),
  email_fts: z.string(),
  phone_fts: z.string(),
}).strict();

export const CloudPrdResourceSchemas = Object.freeze({
  companies: CustomerSchema,
  companies_summary: CustomerSummarySchema,
  contacts: CustomerContactSchema,
  contacts_summary: ContactSummarySchema,
  social_accounts: CustomerSocialAccountSchema,
  deals: CustomerDealSchema,
  follow_ups: CustomerFollowUpSchema,
  reminders: CustomerReminderSchema,
  deal_risks: DealRiskSchema,
  deal_milestones: DealMilestoneSchema,
});

export type CloudPrdResourceName = keyof typeof CloudPrdResourceSchemas;

/**
 * Atomic CRM still has auxiliary resources outside the DealPilot PRD. This
 * compatibility contract guarantees only React Admin identity for those
 * resources; PRD resources must always use the strict schemas above.
 */
export const LegacyAtomicRecordSchema = z
  .object({ id: z.union([z.string(), z.number()]) })
  .passthrough();

export const isCloudPrdResource = (
  resource: string,
): resource is CloudPrdResourceName =>
  Object.prototype.hasOwnProperty.call(CloudPrdResourceSchemas, resource);

export const cloudRecordSchemaFor = (resource: string): z.ZodTypeAny =>
  isCloudPrdResource(resource)
    ? CloudPrdResourceSchemas[resource]
    : LegacyAtomicRecordSchema;

export type ContactSummary = z.infer<typeof ContactSummarySchema>;
export type ContactCreateInput = z.infer<typeof ContactCreateInputSchema>;
export type ContactUpdateInput = z.infer<typeof ContactUpdateInputSchema>;
export type ContactTag = z.infer<typeof ContactTagSchema>;

export const DealContactIdsSchema = z.array(ContactIdSchema);

export const DealContactSchema = z
  .object({
    owner_user_id: UserIdSchema,
    deal_id: DealIdSchema,
    contact_id: ContactIdSchema,
    created_at: DateTimeSchema,
  })
  .strict();

const DealWriteShape = z.object({
  company_id: CustomerIdSchema,
  name: z.string().min(1),
  category: NullableTextSchema,
  stage: CustomerDealSchema.shape.stage,
  grade: CustomerDealSchema.shape.grade,
  description: NullableTextSchema,
  currency: z.string().length(3),
  amount: z.number().nonnegative().nullable(),
  probability: z.number().int().min(0).max(100).nullable(),
  expected_closing_date: z.string().date().nullable(),
  closed_reason: NullableTextSchema,
  archived_at: DateTimeSchema.nullable(),
  sort_index: z.number().int().nullable(),
});

export const DealCreateInputSchema = DealWriteShape.partial({
  category: true,
  stage: true,
  grade: true,
  description: true,
  currency: true,
  amount: true,
  probability: true,
  expected_closing_date: true,
  closed_reason: true,
  archived_at: true,
  sort_index: true,
}).strict();

export const DealUpdateInputSchema = DealWriteShape.partial().strict();

const DEAL_WRITE_FIELDS = Object.freeze([
  "company_id",
  "name",
  "category",
  "stage",
  "grade",
  "description",
  "currency",
  "amount",
  "probability",
  "expected_closing_date",
  "closed_reason",
  "archived_at",
] as const);

const projectDealWriteFields = (input: Readonly<Record<string, unknown>>) => {
  const projected = Object.fromEntries(
    DEAL_WRITE_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(input, field),
    ).map((field) => [field, input[field]]),
  );
  if (Object.prototype.hasOwnProperty.call(input, "index")) {
    projected.sort_index = input.index;
  } else if (Object.prototype.hasOwnProperty.call(input, "sort_index")) {
    projected.sort_index = input.sort_index;
  }
  return projected;
};

export const toDealCreateInput = (input: Readonly<Record<string, unknown>>) =>
  DealCreateInputSchema.parse(projectDealWriteFields(input));

export const toDealUpdateInput = (input: Readonly<Record<string, unknown>>) =>
  DealUpdateInputSchema.parse(projectDealWriteFields(input));

export type DealContact = z.infer<typeof DealContactSchema>;
export type DealCreateInput = z.infer<typeof DealCreateInputSchema>;
export type DealUpdateInput = z.infer<typeof DealUpdateInputSchema>;
