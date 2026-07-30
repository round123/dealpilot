import { Form, RecordContextProvider, ResourceContextProvider } from "ra-core";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { Company } from "../types";
import { CompanyInputs } from "./CompanyInputs";

const customer: Company = {
  id: "7a5d9e9e-a729-44c4-9f99-831a685c31e5",
  name: "Northwind",
  company: "Northwind Trading",
  country: "Canada",
  source: "Referral",
  grade: "A",
  status: "active",
  deleted_at: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-30T00:00:00.000Z",
  logo: {} as Company["logo"],
  sector: "other",
  size: 10,
  linkedin_url: "",
  website: "",
  phone_number: "",
  address: "",
  zipcode: "",
  city: "",
  state_abbr: "",
  description: "",
  revenue: "",
  tax_identifier: "",
  context_links: [],
};

const FormFixture = ({ record }: { record?: Company }) => (
  <StoryWrapper>
    <ResourceContextProvider value="companies">
      <RecordContextProvider value={record}>
        <Form defaultValues={{ grade: "B", status: "active" }}>
          <CompanyInputs />
        </Form>
      </RecordContextProvider>
    </ResourceContextProvider>
  </StoryWrapper>
);

describe("Customer inputs", () => {
  it("shows V1 customer fields with B and active defaults", async () => {
    const screen = await render(<FormFixture />);

    await expect.element(screen.getByLabelText("Customer name")).toBeVisible();
    await expect.element(screen.getByLabelText("Company")).toBeVisible();
    await expect.element(screen.getByLabelText("Country")).toBeVisible();
    await expect.element(screen.getByLabelText("Source")).toBeVisible();
    await expect.element(screen.getByRole("combobox", { name: /Grade/ })).toHaveTextContent("B");
    await expect.element(screen.getByRole("combobox", { name: /Status/ })).toHaveTextContent("Active");
  });

  it("shows server-managed timestamps as disabled fields when editing", async () => {
    const screen = await render(<FormFixture record={customer} />);

    await expect.element(screen.getByLabelText("Updated at")).toBeDisabled();
    await expect.element(screen.getByLabelText("Deleted at")).toBeDisabled();
  });
});
