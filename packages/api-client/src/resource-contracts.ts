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

const CustomerWriteShape = z.object({
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
  grade: CustomerSchema.shape.grade,
  status: CustomerSchema.shape.status,
});

export const CustomerCreateInputSchema = CustomerWriteShape.partial({
  company: true,
  sector: true,
  size: true,
  linkedin_url: true,
  website: true,
  phone_number: true,
  address: true,
  zipcode: true,
  city: true,
  state_abbr: true,
  country: true,
  description: true,
  revenue: true,
  tax_identifier: true,
  logo: true,
  context_links: true,
  source: true,
  grade: true,
  status: true,
}).strict();
export const CustomerUpdateInputSchema = CustomerWriteShape.partial().strict();

const CUSTOMER_WRITE_FIELDS = Object.freeze([
  "name",
  "company",
  "sector",
  "size",
  "linkedin_url",
  "website",
  "phone_number",
  "address",
  "zipcode",
  "city",
  "state_abbr",
  "country",
  "description",
  "revenue",
  "tax_identifier",
  "logo",
  "context_links",
  "source",
  "grade",
  "status",
] as const);

const projectCustomerWriteFields = (input: Readonly<Record<string, unknown>>) =>
  Object.fromEntries(
    CUSTOMER_WRITE_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(input, field),
    ).map((field) => [field, input[field]]),
  );

export const toCustomerCreateInput = (
  input: Readonly<Record<string, unknown>>,
) => CustomerCreateInputSchema.parse(projectCustomerWriteFields(input));

export const toCustomerUpdateInput = (
  input: Readonly<Record<string, unknown>>,
) => CustomerUpdateInputSchema.parse(projectCustomerWriteFields(input));

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
export type CustomerCreateInput = z.infer<typeof CustomerCreateInputSchema>;
export type CustomerUpdateInput = z.infer<typeof CustomerUpdateInputSchema>;
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
  name: CustomerDealSchema.shape.name,
  category: NullableTextSchema,
  stage: CustomerDealSchema.shape.stage,
  grade: CustomerDealSchema.shape.grade,
  description: NullableTextSchema,
  currency: CustomerDealSchema.shape.currency,
  amount: z.number().nonnegative().nullable(),
  probability: z.number().int().min(0).max(100).nullable(),
  expected_closing_date: z.string().date().nullable(),
  closed_reason: NullableTextSchema,
  archived_at: DateTimeSchema.nullable(),
  sort_index: CustomerDealSchema.shape.sort_index,
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
