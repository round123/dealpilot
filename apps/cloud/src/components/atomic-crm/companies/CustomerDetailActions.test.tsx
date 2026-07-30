import {
  RecordContextProvider,
  ResourceContextProvider,
  TestTranslationProvider,
} from "ra-core";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { Company } from "../types";
import { CustomerDetailActions } from "./CustomerDetailActions";

const customer = {
  id: "7a5d9e9e-a729-44c4-9f99-831a685c31e5",
  name: "Northwind",
  company: "Northwind Trading",
  country: "Canada",
  source: "Referral",
  grade: "A",
  status: "active",
  deleted_at: null,
} as Company;

const ActionsFixture = () => (
  <StoryWrapper>
    <ResourceContextProvider value="companies">
      <RecordContextProvider value={customer}>
        <TestTranslationProvider translate={(key: string) => key}>
          <CustomerDetailActions />
        </TestTranslationProvider>
      </RecordContextProvider>
    </ResourceContextProvider>
  </StoryWrapper>
);

const expectAllCustomerCommands = async (
  screen: Awaited<ReturnType<typeof render>>,
) => {
  await expect
    .element(
      screen.getByRole("region", {
        name: "resources.companies.detail.actions",
      }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("link", { name: "resources.companies.action.edit" }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("button", {
        name: "resources.companies.merge.action",
      }),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByRole("button", {
        name: "resources.companies.soft_delete.action",
      }),
    )
    .toBeVisible();
};

describe("Customer detail actions", () => {
  it("keeps Edit, Merge, and Soft Delete reachable on desktop", async () => {
    page.viewport(1440, 900);
    const screen = await render(<ActionsFixture />);

    await expectAllCustomerCommands(screen);
  });

  it("keeps Edit, Merge, and Soft Delete reachable on mobile", async () => {
    page.viewport(390, 844);
    const screen = await render(<ActionsFixture />);

    await expectAllCustomerCommands(screen);
  });
});
