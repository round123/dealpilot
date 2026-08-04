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
    await expect
      .element(screen.getByText(/云备份创建满 35 天后自动淘汰/))
      .toBeVisible();
    await expect.element(screen.getByText(/摘要当前随账号保留/)).toBeVisible();
    await expect
      .element(screen.getByText(/默认不会向 Gravatar 发送邮箱哈希/))
      .toBeVisible();
    await expect
      .element(screen.getByText(/不会根据客户邮箱域名请求 favicon/))
      .toBeVisible();
    await expect
      .element(screen.getByText(/主动进入受支持的一对一会话时/))
      .toBeVisible();
    await expect
      .element(screen.getByText(/将这些会话身份数据传输到位于新加坡的/))
      .toBeVisible();
    await expect
      .element(screen.getByText(/主动点击“标记消息”时/))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          /读取该单条消息的正文、方向和可用时间，并将其传输到位于新加坡的/,
        ),
      )
      .toBeVisible();
    await expect
      .element(screen.getByText(/卸载扩展不会自动删除已传输到云端的数据/))
      .toBeVisible();

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
