import type { CustomerFollowUp } from "@dealpilot/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Edit3, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  RecordContextProvider,
  useDelete,
  useListContext,
  useNotify,
  useTranslate,
} from "ra-core";
import { Link } from "react-router";

import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { Confirm } from "@/components/admin/confirm";
import { CreateButton } from "@/components/admin/create-button";
import { ReferenceInput } from "@/components/admin/reference-input";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { TextField } from "@/components/admin/text-field";
import { Button } from "@/components/ui/button";

import { invalidateEngagementQueries } from "../engagements/invalidateEngagementQueries";

export const FollowUpList = () => {
  const translate = useTranslate();
  const filters = useMemo(
    () => [
      <ReferenceInput
        key="company_id"
        source="company_id"
        reference="companies"
        alwaysOn
      >
        <AutocompleteInput
          optionText="name"
          label={translate("resources.follow_ups.filters.company", {
            _: "按客户筛选",
          })}
          helperText={false}
        />
      </ReferenceInput>,
      <ReferenceInput key="deal_id" source="deal_id" reference="deals" alwaysOn>
        <AutocompleteInput
          optionText="name"
          label={translate("resources.follow_ups.filters.deal", {
            _: "按项目筛选",
          })}
          helperText={false}
        />
      </ReferenceInput>,
    ],
    [translate],
  );
  return (
    <List<CustomerFollowUp>
      resource="follow_ups"
      title={translate("resources.follow_ups.name", {
        _: "跟进记录",
        smart_count: 2,
      })}
      filters={filters}
      actions={<FollowUpListActions />}
      perPage={25}
      sort={{ field: "occurred_at", order: "DESC" }}
    >
      <FollowUpListContent />
    </List>
  );
};

const FollowUpListActions = () => {
  const translate = useTranslate();
  return (
    <CreateButton
      resource="follow_ups"
      label={translate("resources.follow_ups.action.create", {
        _: "新建跟进",
      })}
    />
  );
};

export const FollowUpListContent = () => {
  const { data, isPending } = useListContext<CustomerFollowUp>();
  const translate = useTranslate();

  if (isPending) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {translate("resources.follow_ups.loading", { _: "正在加载跟进..." })}
      </p>
    );
  }

  if (!data?.length) {
    return (
      <div className="border-y py-12 text-center">
        <h3 className="text-base font-semibold">
          {translate("resources.follow_ups.empty.title", {
            _: "暂无跟进记录",
          })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate("resources.follow_ups.empty.description", {
            _: "记录一次电话、拜访、邮件或消息跟进。",
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y border-y">
      {data.map((followUp) => (
        <RecordContextProvider key={followUp.id} value={followUp}>
          <FollowUpRow followUp={followUp} />
        </RecordContextProvider>
      ))}
    </div>
  );
};

const FollowUpRow = ({ followUp }: { followUp: CustomerFollowUp }) => {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const translate = useTranslate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOne, { isPending }] = useDelete<CustomerFollowUp>(
    "follow_ups",
    {},
    {
      mutationMode: "pessimistic",
      retry: false,
      onError: () =>
        notify("resources.follow_ups.notifications.delete_failed", {
          _: "删除跟进失败，请稍后重试",
          type: "error",
        }),
      onSuccess: async () => {
        setConfirmOpen(false);
        await invalidateEngagementQueries(
          queryClient,
          "follow_ups",
          followUp.company_id,
        );
        notify("resources.follow_ups.notifications.deleted", {
          _: "跟进已删除",
          type: "success",
        });
      },
    },
  );

  const typeLabel = translate(`resources.follow_ups.types.${followUp.type}`, {
    _: followUp.type,
  });
  const summary = followUp.note || followUp.message_body;

  return (
    <article className="grid min-w-0 gap-3 py-4 md:grid-cols-[9rem_minmax(0,1fr)_auto] md:items-center">
      <div>
        <p className="font-medium">{typeLabel}</p>
        <time
          className="text-sm text-muted-foreground"
          dateTime={followUp.occurred_at}
        >
          {formatDateTime(followUp.occurred_at)}
        </time>
      </div>
      <div className="min-w-0">
        <p className="break-words text-sm">
          {summary ||
            translate("resources.follow_ups.empty_note", { _: "无文字记录" })}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {translate("resources.follow_ups.fields.company_id", { _: "客户" })}:{" "}
          <ReferenceField source="company_id" reference="companies" link="show">
            <TextField source="name" />
          </ReferenceField>
          {followUp.deal_id ? (
            <>
              {" · "}
              {translate("resources.follow_ups.fields.deal_id", { _: "项目" })}
              {": "}
              <ReferenceField source="deal_id" reference="deals" link={false}>
                <TextField source="name" />
              </ReferenceField>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex min-h-9 items-center justify-end gap-1">
        <Button variant="ghost" size="icon" asChild>
          <Link
            to={`/follow_ups/${followUp.id}`}
            aria-label={translate("resources.follow_ups.action.edit", {
              _: "编辑跟进",
            })}
          >
            <Edit3 className="size-4" />
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
          aria-label={translate("resources.follow_ups.action.delete", {
            _: "删除跟进",
          })}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <Confirm
        isOpen={confirmOpen}
        loading={isPending}
        title={translate("resources.follow_ups.delete.title", {
          _: "确认删除这条跟进？",
        })}
        content={translate("resources.follow_ups.delete.description", {
          _: "删除后无法恢复。",
        })}
        confirm={translate("resources.follow_ups.action.delete", {
          _: "删除跟进",
        })}
        confirmColor="warning"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          deleteOne("follow_ups", {
            id: followUp.id,
            previousData: followUp,
          })
        }
      />
    </article>
  );
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
