import type { Customer, CustomerSummary } from "@dealpilot/api-client";

const mocks = vi.hoisted(() => ({
  softDeleteCustomer: vi.fn(),
  restoreCustomer: vi.fn(),
  mergeCustomers: vi.fn(),
}));

vi.mock("./apiClient", () => ({
  getCloudApiClient: () => ({ customers: mocks }),
}));

import { cloudCustomerOperations } from "./cloudCustomerOperations";
import { getCustomerCursorRevision } from "./customerCursorState";

const source = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Source",
  company: null,
  country: null,
  source: null,
  grade: "A",
  status: "active",
} as Customer;
const target = {
  ...source,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Target",
} as unknown as CustomerSummary;

describe("Cloud Customer cursor invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.softDeleteCustomer.mockResolvedValue(source);
    mocks.restoreCustomer.mockResolvedValue(source);
    mocks.mergeCustomers.mockResolvedValue(target);
  });

  it("invalidates cached pages after delete, restore, and merge", async () => {
    const before = getCustomerCursorRevision();

    await cloudCustomerOperations.softDeleteCustomer(source.id);
    await cloudCustomerOperations.restoreCustomer(source.id);
    await cloudCustomerOperations.mergeCustomers(source, target, {});

    expect(getCustomerCursorRevision()).toBe(before + 3);
  });

  it("keeps cached pages when a Customer mutation fails", async () => {
    const before = getCustomerCursorRevision();
    mocks.restoreCustomer.mockRejectedValue(new Error("failed"));

    await expect(
      cloudCustomerOperations.restoreCustomer(source.id),
    ).rejects.toThrow("failed");
    expect(getCustomerCursorRevision()).toBe(before);
  });
});
