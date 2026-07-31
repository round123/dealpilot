import {
  API_ERROR_CODES,
  ApiError,
  type Customer,
  type CustomerSummary,
} from "@dealpilot/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecordContextProvider, TestTranslationProvider } from "ra-core";
import { MemoryRouter, Route, Routes } from "react-router";
import { render } from "vitest-browser-react";

import type { Company } from "../types";
import { customerDetailQueryKey } from "./useCustomerDetail";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  mergeCustomers: vi.fn(),
}));

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({
    list: mocks.list,
    customers: {
      mergeCustomers: mocks.mergeCustomers,
    },
  }),
}));

import { MergeCustomerButton } from "./MergeCustomerButton";

const source = {
  id: 7,
  name: "Source name",
  company: "Source company",
  country: "France",
  source: "Referral",
  grade: "A",
  status: "inactive",
} as unknown as Company;

const target = {
  id: "433a3c44-eb40-4e35-a109-116289071988",
  name: "Target name",
  company: "Target company",
  country: "Canada",
  source: "Event",
  grade: "B",
  status: "active",
  deleted_at: null,
} as unknown as CustomerSummary;

const renderButton = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const sourceDetail = { id: source.id, marker: "keep-on-failure" };
  queryClient.setQueryData(customerDetailQueryKey(source.id), sourceDetail);
  return {
    queryClient,
    sourceDetail,
    screen: render(
      <QueryClientProvider client={queryClient}>
        <TestTranslationProvider translate={(key: string) => key}>
          <MemoryRouter initialEntries={[`/companies/${source.id}/show`]}>
            <Routes>
              <Route
                path="/companies/:id/show"
                element={
                  <RecordContextProvider value={source}>
                    <MergeCustomerButton />
                  </RecordContextProvider>
                }
              />
              <Route
                path={`/companies/${target.id}/show`}
                element={<p>Target Customer detail</p>}
              />
            </Routes>
          </MemoryRouter>
        </TestTranslationProvider>
      </QueryClientProvider>,
    ),
  };
};

const chooseTarget = async (screen: Awaited<ReturnType<typeof render>>) => {
  await screen
    .getByRole("button", { name: "resources.companies.merge.action" })
    .click();
  await screen.getByRole("radio", { name: /Target name/ }).click();
  for (const field of [
    "name",
    "company",
    "country",
    "source",
    "grade",
    "status",
  ]) {
    await expect
      .element(
        screen.getByRole("radio", {
          name: `resources.companies.fields.${field} resources.companies.merge.target`,
        }),
      )
      .toBeChecked();
  }
};

describe("MergeCustomerButton", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.mergeCustomers.mockReset();
    mocks.list.mockResolvedValue({ data: [target], total: 1 });
  });

  it("submits once, disables duplicate submission, clears source detail, and navigates", async () => {
    let resolveMerge!: (customer: Customer) => void;
    mocks.mergeCustomers.mockReturnValue(
      new Promise<Customer>((resolve) => {
        resolveMerge = resolve;
      }),
    );
    const { screen: screenPromise, queryClient } = renderButton();
    const screen = await screenPromise;
    await chooseTarget(screen);
    await screen
      .getByRole("radio", {
        name: "resources.companies.fields.name resources.companies.merge.source",
      })
      .click();

    const submit = screen.getByRole("button", {
      name: "resources.companies.merge.confirm",
    });
    await submit.click();
    await expect
      .element(
        screen.getByRole("button", {
          name: "resources.companies.merge.merging",
        }),
      )
      .toBeDisabled();
    expect(mocks.mergeCustomers).toHaveBeenCalledTimes(1);
    resolveMerge(target as unknown as Customer);

    await expect
      .element(screen.getByText("Target Customer detail"))
      .toBeVisible();
    expect(mocks.mergeCustomers).toHaveBeenCalledTimes(1);
    expect(mocks.mergeCustomers).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "7",
        targetId: target.id,
        fieldResolutions: expect.objectContaining({
          name: "Source name",
          company: "Target company",
          country: "Canada",
          source: "Event",
          grade: "B",
          status: "active",
        }),
      }),
      { signal: undefined },
    );
    expect(
      queryClient.getQueryData(customerDetailQueryKey(source.id)),
    ).toBeUndefined();
  });

  it("keeps the dialog and caches unchanged when the merge fails", async () => {
    mocks.mergeCustomers.mockRejectedValue(
      new ApiError({
        code: API_ERROR_CODES.conflict,
        message: "Target changed",
      }),
    );
    const { screen: screenPromise, queryClient, sourceDetail } = renderButton();
    const screen = await screenPromise;
    await chooseTarget(screen);
    await screen
      .getByRole("button", { name: "resources.companies.merge.confirm" })
      .click();

    await expect
      .element(screen.getByText("resources.companies.merge.error_title"))
      .toBeVisible();
    await expect
      .element(
        screen.getByRole("heading", {
          name: "resources.companies.merge.title",
        }),
      )
      .toBeVisible();
    expect(queryClient.getQueryData(customerDetailQueryKey(source.id))).toBe(
      sourceDetail,
    );
    expect(mocks.mergeCustomers).toHaveBeenCalledTimes(1);
  });
});
