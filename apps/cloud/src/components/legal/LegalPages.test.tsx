import { MemoryRouter, Route, Routes } from "react-router";
import { render } from "vitest-browser-react";

import { PrivacyPolicyPage } from "./PrivacyPolicyPage";
import { TermsOfServicePage } from "./TermsOfServicePage";

describe("public legal pages", () => {
  it("publishes the Chinese privacy, cross-border, retention and supplier notice", async () => {
    const screen = await render(
      <MemoryRouter initialEntries={[PrivacyPolicyPage.path]}>
        <Routes>
          <Route
            path={PrivacyPolicyPage.path}
            element={<PrivacyPolicyPage />}
          />
          <Route
            path={TermsOfServicePage.path}
            element={<TermsOfServicePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await expect
      .element(screen.getByRole("heading", { name: "隐私政策", level: 1 }))
      .toBeVisible();
    await expect.element(screen.getByText(/首选区域为新加坡/)).toBeVisible();
    await expect.element(screen.getByText(/Supabase：提供 Auth/)).toBeVisible();
    await expect.element(screen.getByText(/默认保留 30 天/)).toBeVisible();

    await screen.getByRole("link", { name: "查看服务条款" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "服务条款", level: 1 }))
      .toBeVisible();
  });

  it("publishes the Chinese service terms and links back to privacy", async () => {
    const screen = await render(
      <MemoryRouter initialEntries={[TermsOfServicePage.path]}>
        <Routes>
          <Route
            path={TermsOfServicePage.path}
            element={<TermsOfServicePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await expect
      .element(screen.getByRole("heading", { name: "服务条款", level: 1 }))
      .toBeVisible();
    await expect
      .element(screen.getByText(/完成邮箱确认后使用账号/))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "查看隐私政策" }))
      .toHaveAttribute("href", "/privacy");
  });
});
