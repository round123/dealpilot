import type { CustomerReminder } from "@dealpilot/api-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  BellOff,
  CalendarClock,
  Check,
  Clock3,
  Loader2,
  MessageCircleReply,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  RecordContextProvider,
  useListContext,
  useNotify,
  useTranslate,
  useUpdate,
} from "ra-core";

import { CreateButton } from "@/components/admin/create-button";
import { List } from "@/components/admin/list";
import { ReferenceField } from "@/components/admin/reference-field";
import { SelectInput } from "@/components/admin/select-input";
import { TextField } from "@/components/admin/text-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { invalidateEngagementQueries } from "../engagements/invalidateEngagementQueries";
import {
  groupReminder,
  isReminderOverdue,
  REMINDER_STATUSES,
} from "./reminderContract";

export const ReminderList = () => {
  const translate = useTranslate();
  const filters = useMemo(
    () => [
      <SelectInput
        key="status"
        source="status"
        alwaysOn
        label={translate("resources.reminders.filters.status", {
          _: "状态",
        })}
        choices={REMINDER_STATUSES.map((status) => ({
          id: status,
          name: translate(`resources.reminders.statuses.${status}`, {
            _: reminderStatusFallbacks[status],
          }),
        }))}
        helperText={false}
      />,
    ],
    [translate],
  );

  return (
    <List<CustomerReminder>
      resource="reminders"
      title={translate("resources.reminders.name", {
        _: "提醒",
        smart_count: 2,
      })}
      filters={filters}
      actions={<ReminderListActions />}
      perPage={50}
      sort={{ field: "due_at", order: "ASC" }}
    >
      <ReminderListContent />
    </List>
  );
};

const ReminderListActions = () => {
  const translate = useTranslate();
  return (
    <CreateButton
      resource="reminders"
      label={translate("resources.reminders.action.create", {
        _: "新建提醒",
      })}
    />
  );
};

export const ReminderListContent = ({ now = new Date() }: { now?: Date }) => {
  const { data, isPending } = useListContext<CustomerReminder>();
  const translate = useTranslate();

  if (isPending) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {translate("resources.reminders.loading", { _: "正在加载提醒..." })}
      </p>
    );
  }

  if (!data?.length) {
    return (
      <div className="border-y py-12 text-center">
        <h3 className="text-base font-semibold">
          {translate("resources.reminders.empty.title", { _: "暂无提醒" })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate("resources.reminders.empty.description", {
            _: "创建一个指定时间或等待回复的提醒。",
          })}
        </p>
      </div>
    );
  }

  const grouped = data.reduce<
    Partial<Record<(typeof reminderGroupOrder)[number], CustomerReminder[]>>
  >((groups, reminder) => {
    const group = groupReminder(reminder, now);
    (groups[group] ??= []).push(reminder);
    return groups;
  }, {});

  return (
    <div className="space-y-7">
      {reminderGroupOrder.map((group) => {
        const reminders = grouped[group];
        if (!reminders?.length) return null;
        return (
          <section key={group} aria-labelledby={`reminders-${group}`}>
            <div className="mb-2 flex items-baseline justify-between border-b pb-2">
              <h3 id={`reminders-${group}`} className="text-sm font-semibold">
                {translate(`resources.reminders.groups.${group}`, {
                  _: reminderGroupFallbacks[group],
                })}
              </h3>
              <span className="text-xs text-muted-foreground">
                {reminders.length}
              </span>
            </div>
            <div className="divide-y">
              {reminders.map((reminder) => (
                <RecordContextProvider key={reminder.id} value={reminder}>
                  <ReminderRow reminder={reminder} now={now} />
                </RecordContextProvider>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export const ReminderRow = ({
  reminder,
  now = new Date(),
}: {
  reminder: CustomerReminder;
  now?: Date;
}) => {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const translate = useTranslate();
  const [showCustomSnooze, setShowCustomSnooze] = useState(false);
  const [customSnooze, setCustomSnooze] = useState(() =>
    toDateTimeLocalValue(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
  );
  const [update, { isPending }] = useUpdate<CustomerReminder>(
    "reminders",
    {},
    {
      // React Admin's optimistic mode performs cancel/snapshot/patch/rollback
      // for every cached list/detail before invalidating on settlement.
      mutationMode: "optimistic",
      retry: false,
      onError: () =>
        notify("resources.reminders.notifications.update_failed", {
          _: "提醒更新失败，请稍后重试",
          type: "error",
        }),
      onSuccess: () => {
        setShowCustomSnooze(false);
        notify("resources.reminders.notifications.updated", {
          _: "提醒已更新",
          type: "success",
        });
      },
      onSettled: () =>
        invalidateEngagementQueries(
          queryClient,
          "reminders",
          reminder.company_id,
        ),
    },
  );

  const isClosed = ["completed", "ignored", "replied"].includes(
    reminder.status,
  );
  const overdue = isReminderOverdue(reminder, now);
  const updateReminder = (data: Partial<CustomerReminder>) =>
    update("reminders", {
      id: reminder.id,
      data,
      previousData: reminder,
    });

  return (
    <article className="grid min-w-0 gap-3 py-4 lg:grid-cols-[minmax(14rem,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {translate(`resources.reminders.types.${reminder.type}`, {
              _: reminderTypeFallbacks[reminder.type],
            })}
          </p>
          <span
            className={
              overdue
                ? "rounded-sm bg-destructive px-2 py-0.5 text-xs text-destructive-foreground"
                : "rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            }
          >
            {overdue
              ? translate("resources.reminders.statuses.overdue", {
                  _: "已逾期",
                })
              : translate(`resources.reminders.statuses.${reminder.status}`, {
                  _: reminderStatusFallbacks[reminder.status],
                })}
          </span>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate("resources.reminders.fields.due_at", { _: "到期" })}:{" "}
          {formatDateTime(reminder.snooze_until ?? reminder.due_at)}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {translate("resources.reminders.fields.company_id", { _: "客户" })}:{" "}
          <ReferenceField source="company_id" reference="companies" link="show">
            <TextField source="name" />
          </ReferenceField>
          {reminder.deal_id ? (
            <>
              {" · "}
              {translate("resources.reminders.fields.deal_id", { _: "项目" })}
              {": "}
              <ReferenceField source="deal_id" reference="deals" link={false}>
                <TextField source="name" />
              </ReferenceField>
            </>
          ) : null}
        </p>
      </div>

      {!isClosed ? (
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() =>
              updateReminder({ status: "completed", resolution: "completed" })
            }
          >
            <Check className="size-4" />
            {translate("resources.reminders.action.complete", { _: "完成" })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              const snoozeUntil = new Date(
                now.getTime() + 24 * 60 * 60 * 1000,
              ).toISOString();
              updateReminder({
                status: "snoozed",
                snooze_until: snoozeUntil,
              });
            }}
          >
            <Clock3 className="size-4" />
            {translate("resources.reminders.action.later", { _: "稍后" })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setShowCustomSnooze((open) => !open)}
          >
            <CalendarClock className="size-4" />
            {translate("resources.reminders.action.custom_snooze", {
              _: "自定义稍后",
            })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              updateReminder({ status: "ignored", resolution: "ignored" })
            }
          >
            <BellOff className="size-4" />
            {translate("resources.reminders.action.ignore", { _: "忽略" })}
          </Button>
          {reminder.type === "waiting_reply" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                updateReminder({
                  status: "replied",
                  resolution: "reply_received",
                  snooze_until: null,
                })
              }
            >
              <MessageCircleReply className="size-4" />
              {translate("resources.reminders.action.reply_received", {
                _: "已收到回复",
              })}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showCustomSnooze && !isClosed ? (
        <div className="flex min-w-0 flex-col gap-2 border-t pt-3 sm:flex-row lg:col-span-2 lg:justify-end">
          <Input
            type="datetime-local"
            value={customSnooze}
            min={toDateTimeLocalValue(now)}
            disabled={isPending}
            onChange={(event) => setCustomSnooze(event.target.value)}
            aria-label={translate("resources.reminders.fields.snooze_until", {
              _: "稍后提醒时间",
            })}
            className="w-full sm:w-64"
          />
          <Button
            type="button"
            disabled={isPending || !customSnooze}
            onClick={() =>
              updateReminder({
                status: "snoozed",
                snooze_until: new Date(customSnooze).toISOString(),
              })
            }
          >
            <CalendarClock className="size-4" />
            {translate("resources.reminders.action.confirm_snooze", {
              _: "确认稍后提醒",
            })}
          </Button>
        </div>
      ) : null}
    </article>
  );
};

const reminderGroupOrder = ["overdue", "today", "upcoming", "closed"] as const;

const reminderGroupFallbacks: Record<
  (typeof reminderGroupOrder)[number],
  string
> = {
  overdue: "已逾期",
  today: "今天",
  upcoming: "之后",
  closed: "已处理",
};

const reminderTypeFallbacks: Record<CustomerReminder["type"], string> = {
  fixed_time: "指定时间",
  waiting_reply: "等待回复",
  paused: "暂停提醒",
};

const reminderStatusFallbacks: Record<CustomerReminder["status"], string> = {
  pending: "待处理",
  completed: "已完成",
  snoozed: "已稍后提醒",
  ignored: "已忽略",
  overdue: "已逾期",
  replied: "已回复",
};

const toDateTimeLocalValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
