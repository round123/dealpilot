import { mergeTranslations } from "ra-core";
import polyglotI18nProvider from "ra-i18n-polyglot";
import englishMessages from "ra-language-english";
import frenchMessages from "ra-language-french";
import { raSupabaseEnglishMessages } from "ra-supabase-language-english";
import { raSupabaseFrenchMessages } from "ra-supabase-language-french";
import { englishCrmMessages } from "./englishCrmMessages";
import { frenchCrmMessages } from "./frenchCrmMessages";
import {
  simplifiedChineseCrmMessages,
  simplifiedChineseRaMessages,
  simplifiedChineseSupabaseMessages,
} from "./simplifiedChineseCrmMessages";

export type SupportedLocale = "zh-CN" | "en" | "fr";

const STORED_LOCALE_KEY = "RaStoreCRM.locale";
const DEFAULT_LOCALE_MIGRATION_KEY =
  "DealPilot.locale-default-migration.zh-CN.v1";
const supportedLocales = new Set<SupportedLocale>(["zh-CN", "en", "fr"]);

type LocaleStorage = Pick<Storage, "getItem" | "setItem">;

const raSupabaseEnglishMessagesOverride = {
  "ra-supabase": {
    auth: {
      password_reset: "Check your emails for a Reset Password message.",
    },
    oauth: {
      no_request: "Authorization request is missing",
      approved: "Authorization approved",
      close_tab: "You can close this tab now",
      authorize: "Authorize access to DealPilot",
      authorize_details:
        "This application is requesting access to your DealPilot data.",
      permissions: "Requested permissions",
    },
  },
};

const raSupabaseFrenchMessagesOverride = {
  "ra-supabase": {
    auth: {
      password_reset:
        "Consultez vos emails pour trouver le message de reinitialisation du mot de passe.",
    },
  },
};

const englishCatalog = mergeTranslations(
  englishMessages,
  raSupabaseEnglishMessages,
  raSupabaseEnglishMessagesOverride,
  englishCrmMessages,
);

const frenchCatalog = mergeTranslations(
  englishCatalog,
  frenchMessages,
  raSupabaseFrenchMessages,
  raSupabaseFrenchMessagesOverride,
  frenchCrmMessages,
);

const simplifiedChineseCatalog = mergeTranslations(
  englishCatalog,
  simplifiedChineseRaMessages,
  simplifiedChineseSupabaseMessages,
  simplifiedChineseCrmMessages,
);

export const getInitialLocale = (
  storage: LocaleStorage | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage,
): SupportedLocale => {
  try {
    const storedValue = storage?.getItem(STORED_LOCALE_KEY);
    const parsedValue: unknown = storedValue
      ? JSON.parse(storedValue)
      : undefined;

    // The Atomic CRM base app previously defaulted to English. Migrate that
    // legacy default once, then preserve any language the user selects later.
    if (!storage?.getItem(DEFAULT_LOCALE_MIGRATION_KEY)) {
      storage?.setItem(DEFAULT_LOCALE_MIGRATION_KEY, "1");
      if (parsedValue === "en") {
        storage?.setItem(STORED_LOCALE_KEY, JSON.stringify("zh-CN"));
        return "zh-CN";
      }
    }

    if (storedValue) {
      if (
        typeof parsedValue === "string" &&
        supportedLocales.has(parsedValue as SupportedLocale)
      ) {
        return parsedValue as SupportedLocale;
      }
      if (parsedValue === "zh") {
        return "zh-CN";
      }
    }
  } catch {
    // A blocked or malformed localStorage value must not prevent app startup.
  }

  return "zh-CN";
};

export const i18nProvider = polyglotI18nProvider(
  (locale) => {
    if (locale === "zh-CN" || locale === "zh") {
      return simplifiedChineseCatalog;
    }
    if (locale === "fr") {
      return frenchCatalog;
    }
    return englishCatalog;
  },
  getInitialLocale(),
  [
    { locale: "zh-CN", name: "简体中文" },
    { locale: "en", name: "English" },
    { locale: "fr", name: "Français" },
  ],
  { allowMissing: true },
);

export const testI18nProvider = polyglotI18nProvider(
  () => englishCatalog,
  "en",
  [{ locale: "en", name: "English" }],
  { allowMissing: true },
);
