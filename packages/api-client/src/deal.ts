import { z } from "zod";

import { CustomerDealSchema, type CustomerDeal } from "./customer.js";
import type { ApiClient, ApiRequestOptions } from "./gateway.js";
import { DealIdSchema, type ContactId } from "./ids.js";
import { API_ERROR_CODES, ApiError } from "./error.js";
import {
  DealContactIdsSchema,
  DealUpdateInputSchema,
  toDealUpdateInput,
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

export interface DealWithContacts {
  deal: CustomerDeal;
  contactIds: z.infer<typeof DealContactIdsSchema>;
}

export interface DealApi {
  updateWithContacts(
    input: DealUpdateWithContactsInput,
    options?: ApiRequestOptions,
  ): Promise<DealWithContacts>;
}

type DealRpcClient = Pick<ApiClient, "rpc">;

export function createDealApi(client: DealRpcClient): DealApi {
  return {
    async updateWithContacts(input, options) {
      const parsed = DealUpdateWithContactsInputSchema.safeParse(input);
      if (!parsed.success) {
        const fields: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path.join(".") || "request";
          (fields[field] ??= []).push(issue.message);
        }
        throw new ApiError({
          code: API_ERROR_CODES.validation,
          message: "Invalid Deal update command",
          fields,
          details: parsed.error.issues,
          cause: parsed.error,
        });
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
      const { contact_ids: contactIds, ...deal } = parseData(
        DealWithContactsRpcDataSchema,
        value,
      );
      return {
        deal: CustomerDealSchema.parse(deal),
        contactIds: DealContactIdsSchema.parse(contactIds),
      };
    },
  };
}
