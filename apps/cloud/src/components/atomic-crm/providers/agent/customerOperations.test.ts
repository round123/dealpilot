import type { AgentClient } from "./client";
import { describe, expect, it, vi } from "vitest";

import { createAgentCustomerOperations } from "./customerOperations";

const timestamp = "2026-07-30T08:00:00.000Z";
const deletedCustomer = {
  id: "11111111-1111-4111-8111-111111111112",
  name: "已删除客户",
  company: null,
  country: "中国",
  source: null,
  grade: "A",
  status: "active",
  deleted_at: timestamp,
  created_at: timestamp,
  updated_at: timestamp,
};

describe("Agent customer operations", () => {
  it("lists deleted customers through the Agent recycle-bin endpoint", async () => {
    const get = vi.fn(
      async (path: string, parser: { parse(value: unknown): unknown }) => {
        if (path !== "customers/deleted") throw new Error(`Unexpected GET ${path}`);
        return parser.parse({ items: [deletedCustomer], next_cursor: null });
      },
    );
    const client = { get } as unknown as AgentClient;
    const operations = createAgentCustomerOperations(client);

    const result = await operations.listDeletedCustomers({ page: 1, perPage: 25 });

    expect(get).toHaveBeenCalledWith(
      "customers/deleted",
      expect.anything(),
      expect.objectContaining({ query: { cursor: undefined, limit: 100 } }),
    );
    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: deletedCustomer.id,
      name: "已删除客户",
      deleted_at: timestamp,
    });
  });
});
