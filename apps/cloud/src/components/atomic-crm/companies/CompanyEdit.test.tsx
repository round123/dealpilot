import { render } from "vitest-browser-react";
import { Route, Routes } from "react-router";
import type { DataProvider } from "ra-core";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { Company } from "../types";
import { CompanyEdit } from "./CompanyEdit";

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

describe("CompanyEdit", () => {
  it("waits for the record before rendering a form initialized with server data", async () => {
    let resolveGetOne!: (result: { data: Company }) => void;
    const getOne = vi.fn(
      () =>
        new Promise<{ data: Company }>((resolve) => {
          resolveGetOne = resolve;
        }),
    );

    const screen = await render(
      <StoryWrapper
        initialEntries={[`/companies/${customer.id}`]}
        dataProvider={{ getOne: getOne as DataProvider["getOne"] }}
      >
        <Routes>
          <Route path="/companies/:id" element={<CompanyEdit />} />
        </Routes>
      </StoryWrapper>,
    );

    expect(screen.container.querySelector("form")).toBeNull();
    await expect.poll(() => getOne.mock.calls.length).toBe(1);

    resolveGetOne({ data: customer });

    await expect
      .element(screen.getByRole("textbox", { name: "Customer name" }))
      .toHaveValue("Northwind");
    await expect
      .element(screen.getByRole("button", { name: /^save$/i }))
      .toBeVisible();
  });
});
