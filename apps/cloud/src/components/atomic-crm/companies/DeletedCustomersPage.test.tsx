import {
  API_ERROR_CODES,
  ApiError,
  type Customer,
} from "@dealpilot/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TestTranslationProvider } from "ra-core";
import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  restoreCustomer: vi.fn(),
}));

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({
    list: mocks.list,
    customers: {
      softDeleteCustomer: vi.fn(),
      restoreCustomer: mocks.restoreCustomer,
    },
  }),
}));

import { DeletedCustomersPage } from "./DeletedCustomersPage";

const buildDeletedCustomer = (overrides: Partial<Customer> = {}): Customer =>
  ({
    id: "8de45578-6661-4003-bccf-07ee67d9ee57",
    name: "Northwind",
    company: "Northwind Traders",
    country: "Canada",
    deleted_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }) as unknown as Customer;

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestTranslationProvider translate={(key: string) => key}>
        <MemoryRouter>
          <DeletedCustomersPage />
        </MemoryRouter>
      </TestTranslationProvider>
    </QueryClientProvider>,
  );
};

describe("DeletedCustomersPage", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.restoreCustomer.mockReset();
  });

  it("queries deleted companies with strict server pagination and restores a row", async () => {
    const customer = buildDeletedCustomer();
    mocks.list
      .mockResolvedValueOnce({ data: [customer], total: 1 })
      .mockResolvedValue({ data: [], total: 0 });
    mocks.restoreCustomer.mockResolvedValue({
      ...customer,
      deleted_at: null,
    });
    const screen = await renderPage();

    await expect
      .element(screen.getByText("Northwind", { exact: true }))
      .toBeVisible();
    expect(mocks.list).toHaveBeenCalledWith("companies", expect.anything(), {
      filters: {
        deleted_at: {
          operator: "gt",
          value: "1970-01-01T00:00:00.000Z",
        },
      },
      sort: [
        { field: "deleted_at", order: "desc" },
        { field: "id", order: "asc" },
      ],
      pagination: { page: 1, perPage: 25 },
      signal: expect.any(AbortSignal),
    });

    await screen
      .getByRole("button", { name: "resources.companies.deleted.restore" })
      .click();
    await expect
      .element(screen.getByText("resources.companies.deleted.empty_title"))
      .toBeVisible();
    expect(mocks.restoreCustomer).toHaveBeenCalledWith(customer.id, {
      signal: undefined,
    });
  });

  it("renders the empty state", async () => {
    mocks.list.mockResolvedValue({ data: [], total: 0 });
    const screen = await renderPage();

    await expect
      .element(screen.getByText("resources.companies.deleted.empty_title"))
      .toBeVisible();
  });

  it("renders a stable list error state", async () => {
    mocks.list.mockRejectedValue(
      new ApiError({
        code: API_ERROR_CODES.network,
        message: "private network details",
      }),
    );
    const screen = await renderPage();

    await expect
      .element(screen.getByText("resources.companies.deleted.error_title"))
      .toBeVisible();
    await expect
      .poll(() =>
        screen.container.textContent?.includes("private network details"),
      )
      .toBe(false);
  });

  it("lets the server decide expiry when the local restore deadline has passed", async () => {
    const customer = buildDeletedCustomer({
      deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    });
    mocks.list.mockResolvedValue({
      data: [customer],
      total: 1,
    });
    mocks.restoreCustomer.mockRejectedValue(
      new ApiError({
        code: API_ERROR_CODES.functionError,
        message: "Customer restore window expired",
      }),
    );
    const screen = await renderPage();

    await expect
      .element(
        screen.getByText(
          "resources.companies.deleted.deadline_may_have_passed",
        ),
      )
      .toBeVisible();
    const restoreButton = screen.getByRole("button", {
      name: "resources.companies.deleted.restore",
    });
    await expect.element(restoreButton).toBeEnabled();
    await restoreButton.click();
    await expect
      .element(screen.getByText("resources.companies.deleted.restore_expired"))
      .toBeVisible();
    expect(mocks.restoreCustomer).toHaveBeenCalledWith(customer.id, {
      signal: undefined,
    });
  });

  it("keeps ordinary function failures on the generic restore message", async () => {
    const customer = buildDeletedCustomer();
    mocks.list.mockResolvedValue({ data: [customer], total: 1 });
    mocks.restoreCustomer.mockRejectedValue(
      new ApiError({
        code: API_ERROR_CODES.functionError,
        message: "Database function unavailable",
      }),
    );
    const screen = await renderPage();

    await screen
      .getByRole("button", { name: "resources.companies.deleted.restore" })
      .click();
    await expect
      .element(screen.getByText("resources.companies.deleted.restore_failed"))
      .toBeVisible();
  });
});
