import type { Customer } from "@dealpilot/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordContextProvider, TestTranslationProvider } from "ra-core";
import { MemoryRouter, Route, Routes } from "react-router";
import { render } from "vitest-browser-react";

import type { Company } from "../types";
import { customerDetailQueryKey } from "./useCustomerDetail";

const mocks = vi.hoisted(() => ({
  softDeleteCustomer: vi.fn(),
}));

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({
    customers: {
      softDeleteCustomer: mocks.softDeleteCustomer,
      restoreCustomer: vi.fn(),
    },
  }),
}));

import { SoftDeleteCustomerButton } from "./SoftDeleteCustomerButton";

const company = {
  id: "8de45578-6661-4003-bccf-07ee67d9ee57",
  name: "Northwind",
} as unknown as Company;

describe("SoftDeleteCustomerButton", () => {
  it("confirms, calls the soft-delete command, clears detail, and navigates", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData(customerDetailQueryKey(company.id), {
      id: company.id,
    });
    mocks.softDeleteCustomer.mockResolvedValue({
      ...company,
      deleted_at: new Date().toISOString(),
    } as unknown as Customer);

    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <TestTranslationProvider translate={(key: string) => key}>
          <MemoryRouter initialEntries={[`/companies/${company.id}`]}>
            <Routes>
              <Route
                path="/companies/:id"
                element={
                  <RecordContextProvider value={company}>
                    <SoftDeleteCustomerButton />
                  </RecordContextProvider>
                }
              />
              <Route path="/companies" element={<p>Customers destination</p>} />
            </Routes>
          </MemoryRouter>
        </TestTranslationProvider>
      </QueryClientProvider>,
    );

    await screen
      .getByRole("button", { name: "resources.companies.soft_delete.action" })
      .click();
    await expect
      .element(
        screen.getByRole("heading", {
          name: "resources.companies.soft_delete.title",
        }),
      )
      .toBeVisible();
    await screen
      .getByRole("button", { name: "resources.companies.soft_delete.confirm" })
      .click();

    await expect
      .element(screen.getByText("Customers destination"))
      .toBeVisible();
    expect(mocks.softDeleteCustomer).toHaveBeenCalledWith(company.id, {
      signal: undefined,
    });
    expect(
      queryClient.getQueryData(customerDetailQueryKey(company.id)),
    ).toBeUndefined();
  });
});
