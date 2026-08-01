import { z } from "zod";
import { CustomerReminderSchema, type CustomerReminder } from "./customer.js";
import type { ApiClient, ApiRequestOptions } from "./gateway.js";
import { ReminderIdSchema } from "./ids.js";
import { parseData } from "./contracts.js";

const DateTimeSchema = z.string().datetime({ offset: true });

export const ReminderStatusMutationInputSchema = z
  .object({
    reminderId: ReminderIdSchema,
    idempotencyKey: z.string().uuid(),
    status: z.enum(["completed", "snoozed", "ignored", "replied"]),
    snoozeUntil: DateTimeSchema.nullable().optional(),
    resolution: z.string().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.status === "snoozed" && !input.snoozeUntil) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["snoozeUntil"],
        message: "Snoozed reminders require snoozeUntil",
      });
    }
    if (input.status !== "snoozed" && input.snoozeUntil != null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["snoozeUntil"],
        message: "Only snoozed reminders accept snoozeUntil",
      });
    }
  });

export type ReminderStatusMutationInput = z.infer<
  typeof ReminderStatusMutationInputSchema
>;

export interface ReminderApi {
  updateStatus(
    input: ReminderStatusMutationInput,
    options?: ApiRequestOptions,
  ): Promise<CustomerReminder>;
}

type ReminderRpcClient = Pick<ApiClient, "rpc">;

export function createReminderApi(client: ReminderRpcClient): ReminderApi {
  return {
    async updateStatus(input, options) {
      const command = ReminderStatusMutationInputSchema.parse(input);
      const value = await client.rpc(
        "update_reminder_status_idempotent",
        {
          p_idempotency_key: command.idempotencyKey,
          p_reminder_id: command.reminderId,
          p_status: command.status,
          p_snooze_until: command.snoozeUntil ?? null,
          p_resolution: command.resolution ?? null,
        },
        z.unknown(),
        options,
      );
      return parseData(CustomerReminderSchema, value) as CustomerReminder;
    },
  };
}
