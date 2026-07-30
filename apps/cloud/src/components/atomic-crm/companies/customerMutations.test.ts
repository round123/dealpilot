import {
  API_ERROR_CODES,
  ApiError,
  type Customer,
  type CustomerSummary,
  type ListResult,
} from "@dealpilot/api-client";
import { QueryClient } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  mergeCustomers: vi.fn(),
}));

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({
    customers: {
      mergeCustomers: mocks.mergeCustomers,
    },
  }),
}));

import {
  customerCacheKeys,
  isRestoreWindowError,
  mergeCustomers,
  removeCustomerFromDeletedCaches,
  restoreDeletedCacheSnapshots,
} from "./customerMutations";

const customer = {
  id: "8de45578-6661-4003-bccf-07ee67d9ee57",
  name: "Northwind",
} as unknown as Customer;

describe("Customer mutation cache helpers", () => {
  it("removes a restored customer from every deleted page and rolls back verbatim", () => {
    const queryClient = new QueryClient();
    const firstKey = customerCacheKeys.deletedList(1, 25);
    const secondKey = customerCacheKeys.deletedList(2, 25);
    const firstPage: ListResult<Customer> = {
      data: [customer],
      total: 26,
    };
    const secondPage: ListResult<Customer> = {
      data: [
        {
          ...customer,
          id: "433a3c44-eb40-4e35-a109-116289071988" as Customer["id"],
        },
      ],
      total: 26,
    };
    queryClient.setQueryData(firstKey, firstPage);
    queryClient.setQueryData(secondKey, secondPage);

    const snapshots = removeCustomerFromDeletedCaches(queryClient, customer.id);

    expect(queryClient.getQueryData(firstKey)).toEqual({ data: [], total: 25 });
    expect(queryClient.getQueryData(secondKey)).toBe(secondPage);

    restoreDeletedCacheSnapshots(queryClient, snapshots);
    expect(queryClient.getQueryData(firstKey)).toStrictEqual(firstPage);
    expect(queryClient.getQueryData(secondKey)).toStrictEqual(secondPage);
  });

  it("only classifies the stable backend restore-window failure as expired", () => {
    expect(
      isRestoreWindowError(
        new ApiError({
          code: API_ERROR_CODES.functionError,
          message: "Customer restore window expired",
        }),
      ),
    ).toBe(true);
    expect(
      isRestoreWindowError(
        new ApiError({
          code: API_ERROR_CODES.functionError,
          message: "Database function unavailable",
        }),
      ),
    ).toBe(false);
  });

  it("resolves all six fields before issuing one merge RPC", async () => {
    const source = {
      ...customer,
      name: "Source name",
      company: "Source company",
      country: "France",
      source: "Referral",
      grade: "A",
      status: "inactive",
    } as Customer;
    const target = {
      ...customer,
      id: "433a3c44-eb40-4e35-a109-116289071988",
      name: "Target name",
      company: "Target company",
      country: "Canada",
      source: "Event",
      grade: "B",
      status: "active",
    } as CustomerSummary;
    mocks.mergeCustomers.mockResolvedValue(target);

    await mergeCustomers(source, target, {
      name: "source",
      company: "target",
      country: "source",
      source: "target",
      grade: "source",
      status: "target",
    });

    expect(mocks.mergeCustomers).toHaveBeenCalledTimes(1);
    expect(mocks.mergeCustomers).toHaveBeenCalledWith(
      {
        sourceId: source.id,
        targetId: target.id,
        fieldResolutions: {
          name: "Source name",
          company: "Target company",
          country: "France",
          source: "Event",
          grade: "A",
          status: "active",
        },
      },
      { signal: undefined },
    );
  });
});
