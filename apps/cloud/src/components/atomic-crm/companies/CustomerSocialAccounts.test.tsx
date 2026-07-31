import type { CustomerSocialAccount } from "@dealpilot/api-client";
import { CoreAdminContext, type DataProvider } from "ra-core";
import fakeDataProvider from "ra-data-fakerest";
import { render } from "vitest-browser-react";

import { CustomerSocialAccounts } from "./CustomerSocialAccounts";

const CUSTOMER_ID = "13000000-0000-4000-8000-000000000001";

const i18nProvider = {
  translate: (key: string, options?: { _?: unknown }) =>
    typeof options?._ === "string" ? options._ : key,
  changeLocale: () => Promise.resolve(),
  getLocale: () => "zh-CN",
};

const renderAccounts = async (
  accounts: CustomerSocialAccount[],
  overrides: Partial<DataProvider> = {},
  onChanged = vi.fn(),
) => {
  const baseProvider = fakeDataProvider({ social_accounts: accounts });
  return {
    onChanged,
    screen: await render(
      <CoreAdminContext
        dataProvider={{ ...baseProvider, ...overrides }}
        i18nProvider={i18nProvider}
      >
        <CustomerSocialAccounts
          customerId={CUSTOMER_ID}
          accounts={accounts}
          onChanged={onChanged}
        />
      </CoreAdminContext>,
    ),
  };
};

describe("CustomerSocialAccounts", () => {
  it("adds a Telegram identifier and refreshes the customer detail", async () => {
    const create = vi.fn(async (_resource, params) => ({
      data: {
        id: "14000000-0000-4000-8000-000000000001",
        ...params.data,
      },
    }));
    const { screen, onChanged } = await renderAccounts([], {
      create: create as never,
    });

    await screen.getByRole("button", { name: "添加账号" }).click();
    await screen.getByLabelText("平台").selectOptions("telegram");
    await screen.getByLabelText("账号标识").fill(" @buyer ");
    await screen.getByRole("button", { name: "保存账号" }).click();

    await expect.poll(() => create.mock.calls.length).toBe(1);
    expect(create.mock.calls[0]?.[0]).toBe("social_accounts");
    expect(create.mock.calls[0]?.[1].data).toEqual({
      company_id: CUSTOMER_ID,
      platform: "telegram",
      raw_identifier: "@buyer",
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("keeps the identifier editable when creation fails", async () => {
    const create = vi.fn(async () => {
      throw new Error("duplicate identifier");
    });
    const { screen, onChanged } = await renderAccounts([], {
      create: create as never,
    });

    await screen.getByRole("button", { name: "添加账号" }).click();
    const identifier = screen.getByLabelText("账号标识");
    await identifier.fill("+8613800000000");
    await screen.getByRole("button", { name: "保存账号" }).click();

    await expect.poll(() => create.mock.calls.length).toBe(1);
    await expect.element(identifier).toHaveValue("+8613800000000");
    await expect
      .element(screen.getByRole("button", { name: "保存账号" }))
      .toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("deletes an existing account and refreshes the customer detail", async () => {
    const account = {
      id: "14000000-0000-4000-8000-000000000001",
      owner_user_id: "12000000-0000-4000-8000-000000000001",
      company_id: CUSTOMER_ID,
      contact_id: null,
      platform: "whatsapp",
      raw_identifier: "+8613800000000",
      normalized_identifier: "+8613800000000",
      manually_bound: true,
      created_at: "2026-07-31T08:00:00.000Z",
      updated_at: "2026-07-31T08:00:00.000Z",
    } as CustomerSocialAccount;
    const remove = vi.fn(async (_resource: string, _params: unknown) => ({
      data: account,
    }));
    const { screen, onChanged } = await renderAccounts(
      [account],
      { delete: remove as never },
    );

    await screen
      .getByRole("button", { name: "删除账号 +8613800000000" })
      .click();

    await expect.poll(() => remove.mock.calls.length).toBe(1);
    expect(remove.mock.calls[0]?.[0]).toBe("social_accounts");
    expect(remove.mock.calls[0]?.[1]).toMatchObject({ id: account.id });
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
