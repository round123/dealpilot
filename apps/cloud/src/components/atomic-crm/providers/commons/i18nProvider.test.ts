import { afterEach, describe, expect, it } from "vitest";
import { getInitialLocale, i18nProvider } from "./i18nProvider";

afterEach(async () => {
  await i18nProvider.changeLocale("zh-CN");
});

describe("i18nProvider", () => {
  it("defaults to simplified Chinese and registers all supported locales", () => {
    expect(getInitialLocale(undefined)).toBe("zh-CN");
    expect(i18nProvider.getLocale()).toBe("zh-CN");
    expect(i18nProvider.translate("ra.page.dashboard")).toBe("仪表盘");
    expect(i18nProvider.getLocales?.()).toEqual([
      { locale: "zh-CN", name: "简体中文" },
      { locale: "en", name: "English" },
      { locale: "fr", name: "Français" },
    ]);
  });

  it("honors a previously stored locale and keeps language switching available", async () => {
    const storage = {
      getItem: (key: string) =>
        key === "RaStoreCRM.locale"
          ? JSON.stringify("en")
          : key === "DealPilot.locale-default-migration.zh-CN.v1"
            ? "1"
            : null,
      setItem: () => undefined,
    };

    expect(getInitialLocale(storage)).toBe("en");

    await i18nProvider.changeLocale("en");
    expect(i18nProvider.translate("crm.language")).toBe("Language");

    await i18nProvider.changeLocale("fr");
    expect(i18nProvider.translate("crm.language")).toBe("Langue");
  });

  it("migrates the legacy English default once and preserves later English choices", () => {
    const values = new Map<string, string>([
      ["RaStoreCRM.locale", JSON.stringify("en")],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(getInitialLocale(storage)).toBe("zh-CN");
    expect(values.get("RaStoreCRM.locale")).toBe(JSON.stringify("zh-CN"));

    values.set("RaStoreCRM.locale", JSON.stringify("en"));
    expect(getInitialLocale(storage)).toBe("en");
  });

  it("normalizes the legacy zh locale and ignores unsupported stored values", () => {
    const storage = (locale: string) => ({
      getItem: (key: string) =>
        key === "RaStoreCRM.locale"
          ? JSON.stringify(locale)
          : key === "DealPilot.locale-default-migration.zh-CN.v1"
            ? "1"
            : null,
      setItem: () => undefined,
    });

    expect(getInitialLocale(storage("zh"))).toBe("zh-CN");
    expect(getInitialLocale(storage("es"))).toBe("zh-CN");
  });

  it("falls back to English for a missing Chinese key and exposes no raw known key", async () => {
    await i18nProvider.changeLocale("zh-CN");

    expect(
      i18nProvider.translate("ra.configurable.SimpleList.tertiaryText"),
    ).toBe("Tertiary text");
    expect(i18nProvider.translate("crm.unknown_key")).toBe("crm.unknown_key");
  });

  it("covers the main personal CRM surfaces in natural Chinese", async () => {
    await i18nProvider.changeLocale("zh-CN");

    expect(
      i18nProvider.translate("resources.contacts.name", { smart_count: 2 }),
    ).toBe("联系人");
    expect(
      i18nProvider.translate("resources.deals.name", { smart_count: 2 }),
    ).toBe("项目");
    expect(
      i18nProvider.translate("resources.tasks.name", { smart_count: 2 }),
    ).toBe("待办");
    expect(i18nProvider.translate("crm.dashboard.deals_pipeline")).toBe(
      "项目管道",
    );
    expect(i18nProvider.translate("crm.settings.title")).toBe("设置");
    expect(i18nProvider.translate("resources.companies.merge.action")).toBe(
      "合并",
    );
    expect(i18nProvider.translate("crm.auth.invalid_credentials")).toBe(
      "邮箱或密码不正确",
    );
    expect(i18nProvider.translate("errors.network")).toBe(
      "网络连接失败，请检查网络后重试",
    );
    expect(i18nProvider.translate("errors.storage")).toBe(
      "本地存储空间不足，请释放空间，或先备份后重试",
    );
    expect(i18nProvider.translate("ra-supabase.oauth.authorize")).toBe(
      "授权访问 DealPilot",
    );
  });

  it("translates the language key in french", async () => {
    await i18nProvider.changeLocale("fr");

    expect(i18nProvider.translate("crm.language")).toBe("Langue");
  });

  it("falls back to english for unknown locales", async () => {
    await i18nProvider.changeLocale("es");

    expect(i18nProvider.translate("crm.language")).toBe("Language");
  });

  it("uses customized password reset overrides for en and fr", async () => {
    await i18nProvider.changeLocale("en");
    expect(i18nProvider.translate("ra-supabase.auth.password_reset")).toBe(
      "Check your emails for a Reset Password message.",
    );

    await i18nProvider.changeLocale("fr");
    expect(i18nProvider.translate("ra-supabase.auth.password_reset")).toBe(
      "Consultez vos emails pour trouver le message de reinitialisation du mot de passe.",
    );
  });

  it("translates recently added fr crm keys", async () => {
    await i18nProvider.changeLocale("fr");

    expect(i18nProvider.translate("resources.deals.empty.title")).toBe(
      "Aucune affaire trouvée",
    );
  });
});
