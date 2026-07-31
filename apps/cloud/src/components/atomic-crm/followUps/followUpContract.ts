import type {
  CustomerFollowUp,
  CustomerId,
  DealId,
} from "@dealpilot/api-client";

export const FOLLOW_UP_TYPES = [
  "call",
  "email",
  "chat",
  "visit",
  "note",
  "message",
] as const satisfies ReadonlyArray<CustomerFollowUp["type"]>;

export const MESSAGE_DIRECTIONS = [
  "inbound",
  "outbound",
] as const satisfies ReadonlyArray<
  Exclude<CustomerFollowUp["message_direction"], null>
>;

export type FollowUpFormValues = Pick<
  CustomerFollowUp,
  | "type"
  | "note"
  | "message_body"
  | "message_direction"
  | "occurred_at"
  | "company_id"
  | "deal_id"
>;

export const createFollowUpDefaults = (
  defaults: Partial<FollowUpFormValues> = {},
): FollowUpFormValues => ({
  company_id: "" as CustomerId,
  deal_id: null as DealId | null,
  message_body: null,
  message_direction: null,
  note: null,
  occurred_at: new Date().toISOString(),
  type: "note",
  ...defaults,
});
