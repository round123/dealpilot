import type { CustomerSocialAccount } from "@dealpilot/api-client";
import { Plus, Save, Share2, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  useCreate,
  useDelete,
  useNotify,
  useTranslate,
  type Identifier,
} from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESOURCE = "social_accounts";

export const CustomerSocialAccounts = ({
  customerId,
  accounts,
  onChanged,
}: {
  customerId: Identifier;
  accounts: CustomerSocialAccount[];
  onChanged: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const [showCreate, setShowCreate] = useState(false);
  const [platform, setPlatform] = useState<"whatsapp" | "telegram">(
    "whatsapp",
  );
  const [rawIdentifier, setRawIdentifier] = useState("");
  const [create, createState] = useCreate();
  const [remove, deleteState] = useDelete();
  const t = (key: string, fallback: string) =>
    translate(`resources.companies.related.${key}`, { _: fallback });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const identifier = rawIdentifier.trim();
    if (!identifier) return;

    create(
      RESOURCE,
      {
        data: {
          company_id: customerId,
          platform,
          raw_identifier: identifier,
        },
      },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          setRawIdentifier("");
          setShowCreate(false);
          onChanged();
          notify("resources.companies.related.social_created", {
            messageArgs: { _: "社媒账号已添加" },
          });
        },
        onError: () =>
          notify("resources.companies.related.social_create_error", {
            type: "error",
            messageArgs: { _: "社媒账号添加失败，输入内容已保留" },
          }),
      },
    );
  };

  const deleteAccount = (account: CustomerSocialAccount) => {
    remove(
      RESOURCE,
      { id: account.id, previousData: account },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          onChanged();
          notify("resources.companies.related.social_deleted", {
            messageArgs: { _: "社媒账号已删除" },
          });
        },
        onError: () =>
          notify("resources.companies.related.social_delete_error", {
            type: "error",
            messageArgs: { _: "社媒账号删除失败，请重试" },
          }),
      },
    );
  };

  return (
    <section aria-label={t("social_accounts", "社媒账号")}>
      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-2">
        <Share2 className="size-4 text-muted-foreground" aria-hidden="true" />
        <h4 className="text-sm font-medium">
          {t("social_accounts", "社媒账号")}
        </h4>
        <Badge variant="secondary">{accounts.length}</Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={showCreate}
          onClick={() => setShowCreate(true)}
        >
          <Plus />
          {t("add_social_account", "添加账号")}
        </Button>
      </div>

      {showCreate ? (
        <form className="mb-3 grid gap-3 rounded-md border p-3" onSubmit={submit}>
          <div>
            <Label htmlFor="social-account-platform">
              {t("social_platform", "平台")}
            </Label>
            <select
              id="social-account-platform"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={platform}
              onChange={(event) =>
                setPlatform(event.target.value as "whatsapp" | "telegram")
              }
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>
          <div>
            <Label htmlFor="social-account-identifier">
              {t("social_identifier", "账号标识")}
            </Label>
            <Input
              id="social-account-identifier"
              required
              autoComplete="off"
              placeholder={t(
                "social_identifier_placeholder",
                "手机号或平台用户名",
              )}
              value={rawIdentifier}
              onChange={(event) => setRawIdentifier(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowCreate(false)}
            >
              <X />
              {t("cancel_social_account", "取消")}
            </Button>
            <Button
              type="submit"
              disabled={createState.isPending || !rawIdentifier.trim()}
            >
              <Save />
              {t("save_social_account", "保存账号")}
            </Button>
          </div>
        </form>
      ) : null}

      {accounts.length === 0 && !showCreate ? (
        <p className="text-sm text-muted-foreground">
          {t("empty_social_accounts", "暂无社媒账号")}
        </p>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="space-y-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {platformLabel(account.platform)}
                </p>
                <p
                  className="truncate text-muted-foreground"
                  title={account.raw_identifier}
                >
                  {account.raw_identifier}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={deleteState.isPending}
                aria-label={`${t("delete_social_account", "删除账号")} ${account.raw_identifier}`}
                title={t("delete_social_account", "删除账号")}
                onClick={() => deleteAccount(account)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

const platformLabel = (platform: string) =>
  ({ whatsapp: "WhatsApp", telegram: "Telegram" })[platform.toLowerCase()] ??
  platform;
