import { useMutation } from "@tanstack/react-query";
import { useTheme } from "@/components/admin/use-theme";
import { getErrorMessageKey } from "@/components/admin/error-message";
import { ChevronRight, DatabaseBackup, KeyRound } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemGroup,
  ItemSeparator,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Check, Copy, LogOut, Moon, Smartphone, Sun } from "lucide-react";
import {
  Translate,
  useAuthProvider,
  useGetIdentity,
  useLocaleState,
  useLocales,
  useLogout,
  useNotify,
  useTranslate,
} from "ra-core";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { ChangelogPage } from "../misc/ChangelogPage";
import { personalAccount } from "../providers/personalAccount";
import { useLocalDataOperations } from "../providers/localDataOperations";
import { LocalDataToolsPage } from "./LocalDataToolsPage";
import { LocalBackupStatus } from "./LocalBackupStatus";

const ChangePasswordButton = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const { identity } = useGetIdentity();

  const { mutate: updatePassword } = useMutation({
    mutationKey: ["updatePassword"],
    mutationFn: async () => {
      if (!identity?.email) {
        throw new Error(translate("crm.profile.record_not_found"));
      }
      return personalAccount.resetPassword(identity.email);
    },
    onSuccess: () => {
      notify("crm.profile.password_reset_sent", {
        type: "success",
      });
    },
    onError: (error) => {
      notify(getErrorMessageKey(error, "crm.auth.recovery_error"), {
        type: "error",
      });
    },
  });

  return (
    <Button
      variant="outline"
      className="w-full text-base h-auto"
      onClick={() => updatePassword()}
    >
      <KeyRound className="size-5 mr-3" />
      {translate("crm.profile.password.change")}
    </Button>
  );
};

export const SettingsPageMobile = () => {
  const translate = useTranslate();
  const authProvider = useAuthProvider();
  const logout = useLogout();

  if (!authProvider) return null;

  return (
    <>
      <MobileHeader>
        <h1 className="text-xl font-semibold">
          {translate("crm.settings.title")}
        </h1>
      </MobileHeader>
      <MobileContent>
        <div className="flex flex-col min-h-[calc(100dvh-3.5rem-4.5rem)]">
          <div className="space-y-6">
            <LocalBackupStatus />
            <ProfileSection />
            <PreferencesSection />
            <LocalDataSection />
            <McpServerSection />
            <AboutSection />
          </div>

          <div className="mt-auto pt-6 space-y-3 mb-4">
            <ChangePasswordButton />
            <Button
              variant="destructive"
              className="w-full text-base h-auto"
              onClick={() => logout()}
            >
              <LogOut className="size-5 mr-3" />
              <Translate i18nKey="ra.auth.logout" />
            </Button>
          </div>
        </div>
      </MobileContent>
    </>
  );
};

SettingsPageMobile.path = "/settings";

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 mb-1.5">
    {children}
  </p>
);

const ProfileSection = () => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  if (!identity) return null;

  return (
    <div>
      <SectionLabel>{translate("crm.profile.title")}</SectionLabel>
      <ItemGroup className="rounded-lg border overflow-hidden">
        <Item size="sm">
          <ItemContent>
            <ItemTitle className="font-normal">{identity.fullName}</ItemTitle>
            {identity.email && (
              <p className="text-sm text-muted-foreground">{identity.email}</p>
            )}
          </ItemContent>
        </Item>
      </ItemGroup>
    </div>
  );
};

const PreferencesSection = () => {
  const translate = useTranslate();

  return (
    <div>
      <SectionLabel>{translate("crm.settings.preferences")}</SectionLabel>
      <ItemGroup className="rounded-lg border overflow-hidden">
        <LanguageRow />
        <ItemSeparator />
        <ThemeRow />
      </ItemGroup>
    </div>
  );
};

const LocalDataSection = () => {
  const operations = useLocalDataOperations();
  if (!operations) return null;

  return (
    <div>
      <SectionLabel>本地数据</SectionLabel>
      <ItemGroup className="rounded-lg border overflow-hidden">
        <Item asChild size="sm" className="cursor-pointer">
          <Link to={LocalDataToolsPage.path}>
            <DatabaseBackup className="size-5 text-muted-foreground" />
            <ItemContent>
              <ItemTitle className="font-normal">备份、恢复与全域导出</ItemTitle>
            </ItemContent>
            <ItemActions>
              <ChevronRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Link>
        </Item>
      </ItemGroup>
    </div>
  );
};

const LanguageRow = () => {
  const translate = useTranslate();
  const locales = useLocales();
  const [locale, setLocale] = useLocaleState();

  if (locales.length <= 1) return null;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle className="font-normal text-muted-foreground">
          {translate("crm.language")}
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        <Select value={locale} onValueChange={setLocale}>
          <SelectTrigger
            size="sm"
            className="w-auto !h-auto py-0 border-none shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locales.map((language) => (
              <SelectItem key={language.locale} value={language.locale}>
                {language.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ItemActions>
    </Item>
  );
};

const ThemeRow = () => {
  const translate = useTranslate();
  const { theme, setTheme } = useTheme();

  return (
    <Item size="sm" className="flex-col items-stretch gap-2">
      <ItemTitle className="font-normal text-muted-foreground">
        {translate("crm.theme.label")}
      </ItemTitle>
      <ToggleGroup
        type="single"
        value={theme}
        onValueChange={(value) =>
          value && setTheme(value as "light" | "dark" | "system")
        }
        size="lg"
        variant="outline"
        className="w-full"
      >
        <ToggleGroupItem
          value="system"
          aria-label={translate("crm.theme.system")}
          className="flex-1 gap-2"
        >
          <Smartphone className="size-4" />
          {translate("crm.theme.system")}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="light"
          aria-label={translate("crm.theme.light")}
          className="flex-1 gap-2"
        >
          <Sun className="size-4" />
          {translate("crm.theme.light")}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="dark"
          aria-label={translate("crm.theme.dark")}
          className="flex-1 gap-2"
        >
          <Moon className="size-4" />
          {translate("crm.theme.dark")}
        </ToggleGroupItem>
      </ToggleGroup>
    </Item>
  );
};

const McpServerSection = () => {
  const translate = useTranslate();

  return (
    <div>
      <SectionLabel>{translate("crm.profile.mcp.title")}</SectionLabel>
      <p className="text-sm text-muted-foreground mb-2 px-1">
        {translate("crm.profile.mcp.description")}
      </p>
      <ItemGroup className="rounded-lg border overflow-hidden">
        <CopyPasteRow
          value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`}
        />
      </ItemGroup>
    </div>
  );
};

const AboutSection = () => {
  const translate = useTranslate();

  return (
    <div>
      <SectionLabel>{translate("crm.settings.about")}</SectionLabel>
      <ItemGroup className="rounded-lg border overflow-hidden">
        <Item asChild size="sm" className="cursor-pointer">
          <Link to={ChangelogPage.path}>
            <ItemContent>
              <ItemTitle className="font-normal">
                {translate("crm.changelog.title")}
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <ChevronRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Link>
        </Item>
      </ItemGroup>
    </div>
  );
};

const CopyPasteRow = ({ value }: { value: string }) => {
  const translate = useTranslate();
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    setCopied(true);
    navigator.clipboard.writeText(value);
    setTimeout(() => {
      setCopied(false);
    }, 1500);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Item
            size="sm"
            className="cursor-pointer flex-nowrap"
            onClick={handleCopy}
          >
            <ItemContent className="overflow-hidden">
              <ItemTitle className="font-normal truncate">{value}</ItemTitle>
            </ItemContent>
            <ItemActions className="shrink-0">
              {copied ? (
                <Check className="size-4 text-muted-foreground" />
              ) : (
                <Copy className="size-4 text-muted-foreground" />
              )}
            </ItemActions>
          </Item>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {copied
              ? translate("crm.common.copied")
              : translate("crm.common.copy")}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
