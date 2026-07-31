import { API_ERROR_CODES, ApiError } from "@dealpilot/api-client";
import {
  CustomerDetailSchema,
  CustomerSchema,
  type Customer as AgentCustomer,
} from "@dealpilot/shared";

import type { CustomerOperations } from "../customerOperations";
import { agentVoidParser, type AgentClient } from "./client";
import { mapCustomer, mapCustomerDetail } from "./mappers";

export function createAgentCustomerOperations(
  client: AgentClient,
): CustomerOperations {
  const listCustomerPages = async (path: string, signal?: AbortSignal) => {
    const customers: AgentCustomer[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.get(path, customerPageParser, {
        query: { cursor, limit: 100 },
        signal,
      });
      customers.push(...page.items);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    return customers;
  };
  const listCustomers = (signal?: AbortSignal) =>
    listCustomerPages("customers", signal);

  return {
    async getCustomerDetail(id, { signal } = {}) {
      const detail = await client.get(
        `customers/${encodeURIComponent(String(id))}`,
        CustomerDetailSchema,
        { signal },
      );
      return mapCustomerDetail(detail);
    },

    async listMergeCandidates({ sourceId, search, page, perPage, signal }) {
      const query = search.trim().toLocaleLowerCase();
      const candidates = (await listCustomers(signal))
        .filter(
          (customer) =>
            customer.deleted_at == null &&
            customer.id !== String(sourceId) &&
            (!query ||
              [customer.name, customer.company, customer.country, customer.source]
                .filter(Boolean)
                .some((value) =>
                  String(value).toLocaleLowerCase().includes(query),
                )),
        )
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name) ||
            left.id.localeCompare(right.id),
        );
      const start = Math.max(0, page - 1) * perPage;
      return {
        data: candidates.slice(start, start + perPage).map(mapCustomer),
        total: candidates.length,
      };
    },

    async listDeletedCustomers({ page, perPage, signal }) {
      const deleted = await listCustomerPages("customers/deleted", signal);
      const start = Math.max(0, page - 1) * perPage;
      return {
        data: deleted.slice(start, start + perPage).map(mapCustomer),
        total: deleted.length,
      };
    },

    async softDeleteCustomer(id, { signal } = {}) {
      const current = await client.get(
        `customers/${encodeURIComponent(String(id))}`,
        CustomerDetailSchema,
        { signal },
      );
      await client.delete(
        `customers/${encodeURIComponent(String(id))}`,
        agentVoidParser,
        { signal },
      );
      return {
        ...mapCustomer(current),
        deleted_at: new Date().toISOString(),
      };
    },

    async restoreCustomer(id, { signal } = {}) {
      return mapCustomer(
        await client.post(
          `customers/${encodeURIComponent(String(id))}/restore`,
          {},
          CustomerSchema,
          { signal },
        ),
      );
    },

    async mergeCustomers(source, target, choices, { signal } = {}) {
      if (source.id === target.id) {
        throw new ApiError({
          code: API_ERROR_CODES.validation,
          message: "Source and target customer must differ",
        });
      }
      return mapCustomer(
        await client.post(
          "customers/merge",
          {
            source_id: source.id,
            target_id: target.id,
            field_resolutions: choices,
          },
          CustomerSchema,
          { signal },
        ),
      );
    },
  };
}

const customerPageParser = {
  parse(value: unknown): { items: AgentCustomer[]; next_cursor: string | null } {
    if (!value || typeof value !== "object") {
      throw new Error("Expected a customer cursor page");
    }
    const page = value as { items?: unknown; next_cursor?: unknown };
    if (!Array.isArray(page.items)) throw new Error("Expected customer items");
    if (page.next_cursor !== null && typeof page.next_cursor !== "string") {
      throw new Error("Expected next_cursor");
    }
    return {
      items: page.items.map((item) => CustomerSchema.parse(item)),
      next_cursor: page.next_cursor,
    };
  },
};
