import { z } from "zod";
import type { ApiRequestOptions } from "./gateway.js";

export const AccountDeletionResultSchema = z.object({
  deleted: z.literal(true),
});

export type AccountDeletionResult = z.infer<typeof AccountDeletionResultSchema>;

export interface AccountApi {
  deleteCurrent(options?: ApiRequestOptions): Promise<AccountDeletionResult>;
}

type AccountGateway = {
  invoke<T>(
    functionName: string,
    schema: z.ZodType<T>,
    options?: ApiRequestOptions & { body?: unknown },
  ): Promise<T>;
};

export const createAccountApi = (gateway: AccountGateway): AccountApi => ({
  deleteCurrent(options = {}) {
    return gateway.invoke("delete-account", AccountDeletionResultSchema, {
      ...options,
      body: {},
    });
  },
});
