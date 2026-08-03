import { CoreAdminContext } from "ra-core";
import { render } from "vitest-browser-react";

import { SignupPage } from "./SignupPage";

const messages: Record<string, string> = {
  "crm.auth.signup.create_account": "创建账号",
  "crm.auth.first_name": "名",
  "crm.auth.last_name": "姓",
  "ra.auth.email": "邮箱",
  "ra.auth.password": "密码",
  "ra.auth.sign_in": "登录",
};

const i18nProvider = {
  translate: (key: string) => messages[key] ?? key,
  changeLocale: () => Promise.resolve(),
  getLocale: () => "zh-CN",
};

describe("SignupPage", () => {
  it("requires explicit legal and cloud-processing consent before registration", async () => {
    const screen = await render(
      <CoreAdminContext i18nProvider={i18nProvider}>
        <SignupPage />
      </CoreAdminContext>,
    );

    await screen.getByLabelText("名").fill("明");
    await screen.getByLabelText("姓").fill("李");
    await screen.getByLabelText("邮箱").fill("ming.li@example.com");
    await screen.getByLabelText("密码").fill("secure-pass-123");

    const submit = screen.getByRole("button", { name: "创建账号" });
    await expect.element(submit).toBeDisabled();
    await expect
      .element(screen.getByRole("link", { name: "《隐私政策》" }))
      .toHaveAttribute("href", "#/privacy");
    await expect
      .element(screen.getByRole("link", { name: "《服务条款》" }))
      .toHaveAttribute("href", "#/terms");
    await expect
      .element(screen.getByText(/数据将存储在新加坡的 Supabase/))
      .toBeVisible();

    await screen
      .getByRole("checkbox", { name: "同意隐私政策与服务条款" })
      .click();

    await expect.element(submit).toBeEnabled();
  });
});
