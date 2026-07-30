import { TestTranslationProvider } from "ra-core";
import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";

import { MoreButton } from "./MobileNavigation";

describe("MobileNavigation More menu", () => {
  it("renders navigation labels through stable i18n keys", async () => {
    const screen = await render(
      <TestTranslationProvider translate={(key: string) => key}>
        <MemoryRouter>
          <MoreButton />
        </MemoryRouter>
      </TestTranslationProvider>,
    );

    await screen.getByRole("button", { name: "crm.common.misc" }).click();

    await expect
      .element(
        screen.getByRole("menuitem", { name: "resources.companies.name" }),
      )
      .toBeVisible();
    await expect
      .element(
        screen.getByRole("menuitem", {
          name: "resources.companies.deleted.title",
        }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("menuitem", { name: "crm.settings.title" }))
      .toBeVisible();
  });
});
