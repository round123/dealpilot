import { z } from "zod";

import { CustomerDealSchema, type CustomerDeal } from "./customer.js";
import type { ApiClient, ApiRequestOptions } from "./gateway.js";
import { DealIdSchema, type ContactId } from "./ids.js";
import { API_ERROR_CODES, ApiError } from "./error.js";
import {
  DealContactIdsSchema,
  DealCreateInputSchema,
  DealUpdateInputSchema,
  toDealCreateInput,
  toDealUpdateInput,
  type DealCreateInput,
  type DealUpdateInput,
} from "./resource-contracts.js";
import { parseData } from "./contracts.js";

const DateTimeSchema = z.string().datetime({ offset: true });

export const DealUpdateWithContactsInputSchema = z
  .object({
    dealId: DealIdSchema,
    patch: DealUpdateInputSchema,
    contactIds: DealContactIdsSchema.optional(),
    expectedUpdatedAt: DateTimeSchema.optional(),
  })
  .strict();

export const DealCreateWithContactsInputSchema = z
  .object({
    input: DealCreateInputSchema,
    contactIds: DealContactIdsSchema.optional(),
  })
  .strict();

const UniqueDealContactIdsSchema = DealContactIdsSchema.refine(
  (ids) => new Set(ids).size === ids.length,
  { message: "Deal contact IDs must be unique" },
);

export const DealWithContactsRpcDataSchema = CustomerDealSchema.extend({
  contact_ids: UniqueDealContactIdsSchema,
}).strict();

export interface DealUpdateWithContactsInput {
  dealId: CustomerDeal["id"];
  patch: DealUpdateInput;
  contactIds?: readonly ContactId[];
  expectedUpdatedAt?: string;
}

export interface DealCreateWithContactsInput {
  input: DealCreateInput;
  contactIds?: readonly ContactId[];
}

export interface DealWithContacts {
  deal: CustomerDeal;
  contactIds: z.infer<typeof DealContactIdsSchema>;
}

export interface DealApi {
  createWithContacts(
    input: DealCreateWithContactsInput,
    options?: ApiRequestOptions,
  ): Promise<DealWithContacts>;
  updateWithContacts(
    input: DealUpdateWithContactsInput,
    options?: ApiRequestOptions,
  ): Promise<DealWithContacts>;
}

type DealRpcClient = Pick<ApiClient, "rpc">;

function invalidDealCommand(message: string, error: z.ZodError): ApiError {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "request";
    (fields[field] ??= []).push(issue.message);
  }
  return new ApiError({
    code: API_ERROR_CODES.validation,
    message,
    fields,
    details: error.issues,
    cause: error,
  });
}

function parseDealWithContacts(value: unknown): DealWithContacts {
  const { contact_ids: contactIds, ...deal } = parseData(
    DealWithContactsRpcDataSchema,
    value,
  );
  return {
    deal: CustomerDealSchema.parse(deal),
    contactIds: DealContactIdsSchema.parse(contactIds),
  };
}

export function createDealApi(client: DealRpcClient): DealApi {
  return {
    async createWithContacts(input, options) {
      const parsed = DealCreateWithContactsInputSchema.safeParse(input);
      if (!parsed.success) {
        throw invalidDealCommand("Invalid Deal create command", parsed.error);
      }
      const command = parsed.data;
      const value = await client.rpc(
        "create_deal_with_contacts",
        {
          p_input: toDealCreateInput(command.input),
          p_contact_ids: command.contactIds ?? [],
        },
        z.unknown(),
        options,
      );
      return parseDealWithContacts(value);
    },
    async updateWithContacts(input, options) {
      const parsed = DealUpdateWithContactsInputSchema.safeParse(input);
      if (!parsed.success) {
        throw invalidDealCommand("Invalid Deal update command", parsed.error);
      }
      const command = parsed.data;
      const value = await client.rpc(
        "update_deal_with_contacts",
        {
          p_deal_id: command.dealId,
          p_patch: toDealUpdateInput(command.patch),
          p_contact_ids: command.contactIds ?? null,
          p_expected_updated_at: command.expectedUpdatedAt ?? null,
        },
        z.unknown(),
        options,
      );
      return parseDealWithContacts(value);
    },
  };
}
