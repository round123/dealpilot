import type { CustomerReminder, DealRisk } from "@dealpilot/api-client";
import {
  AlertTriangle,
  BellRing,
  Building2,
  FolderPlus,
  MessageSquareText,
  Plus,
} from "lucide-react";
import { useGetList } from "ra-core";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import type { Company, Deal, FollowUp } from "../types";
import { isUnscheduledPausedReminder } from "../reminders/reminderContract";
import { sortRemindersByPriority } from "./reminderPriority";

const PAGE_SIZE = 10_000;
const OPEN_REMINDER_STATUSES = new Set<CustomerReminder["status"]>([
  "pending",
  "snoozed",
  "overdue",
]);

export const DealPilotDashboard = () => {
  const companiesQuery = useGetList<Company>("companies", listParams("name"));
  const dealsQuery = useGetList<Deal>(
    "deals",
    listParams("updated_at", "DESC"),
  );
  const followUpsQuery = useGetList<FollowUp>(
    "follow_ups",
    listParams("occurred_at", "DESC"),
  );
  const remindersQuery = useGetList<CustomerReminder>(
    "reminders",
    listParams("due_at"),
  );
  const risksQuery = useGetList<DealRisk>(
    "deal_risks",
    listParams("created_at", "DESC"),
  );

  if (
    companiesQuery.isPending ||
    dealsQuery.isPending ||
    followUpsQuery.isPending ||
    remindersQuery.isPending ||
    risksQuery.isPending
  ) {
    return <DashboardLoading />;
  }

  const companies = companiesQuery.data ?? [];
  const deals = dealsQuery.data ?? [];
  const followUps = followUpsQuery.data ?? [];
  const reminders = remindersQuery.data ?? [];
  const risks = risksQuery.data ?? [];
  const now = new Date();
  const openReminders = reminders
    .filter(
      (reminder) =>
        OPEN_REMINDER_STATUSES.has(reminder.status) &&
        !isUnscheduledPausedReminder(reminder),
    );
  const prioritizedReminders = sortRemindersByPriority(openReminders, {
    companies,
    deals,
    risks,
    now,
  });
  const overdueReminders = openReminders.filter(
    (reminder) => getReminderTime(reminder) < now.getTime(),
  );
  const highRiskDealIds = new Set(
    risks
      .filter(
        (risk) =>
          ["open", "handling"].includes(risk.status) &&
          ["high", "critical"].includes(risk.severity),
      )
      .map((risk) => String(risk.deal_id)),
  );
  const companyById = new Map(
    companies.map((company) => [String(company.id), company]),
  );
  const dealById = new Map(deals.map((deal) => [String(deal.id), deal]));

  return (
    <div className="space-y-8 py-2">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">今日工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            先处理逾期提醒和高风险项目，再安排后续跟进。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/reminders/create">
              <Plus className="size-4" />
              新建提醒
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/follow_ups/create">
              <MessageSquareText className="size-4" />
              记录跟进
            </Link>
          </Button>
        </div>
      </header>

      <section
        aria-label="业务概览"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border lg:grid-cols-4"
      >
        <Metric
          icon={BellRing}
          label="待处理提醒"
          value={openReminders.length}
        />
        <Metric
          icon={AlertTriangle}
          label="已逾期"
          value={overdueReminders.length}
          urgent={overdueReminders.length > 0}
        />
        <Metric
          icon={FolderPlus}
          label="高风险项目"
          value={highRiskDealIds.size}
          urgent={highRiskDealIds.size > 0}
        />
        <Metric
          icon={MessageSquareText}
          label="跟进记录"
          value={followUps.length}
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <section aria-labelledby="priority-reminders-title">
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="priority-reminders-title"
              className="text-base font-semibold"
            >
              优先待办
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/reminders">查看全部</Link>
            </Button>
          </div>
          {prioritizedReminders.length ? (
            <div className="divide-y border-y">
              {prioritizedReminders.slice(0, 5).map((reminder) => {
                const company = companyById.get(String(reminder.company_id));
                const deal = reminder.deal_id
                  ? dealById.get(String(reminder.deal_id))
                  : undefined;
                const overdue = getReminderTime(reminder) < now.getTime();
                return (
                  <div
                    key={reminder.id}
                    className="flex min-w-0 items-center gap-3 py-3"
                  >
                    <span
                      className={
                        overdue
                          ? "rounded-sm bg-destructive px-2 py-0.5 text-xs text-destructive-foreground"
                          : "rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {overdue ? "逾期" : "待办"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {company?.name ?? `客户 ${reminder.company_id}`}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {deal?.name ? `${deal.name} · ` : ""}
                        {formatDateTime(
                          reminder.snooze_until ?? reminder.due_at,
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyLine text="当前没有待处理提醒" />
          )}
        </section>

        <section aria-labelledby="quick-actions-title">
          <h2 id="quick-actions-title" className="mb-3 text-base font-semibold">
            快捷操作
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <QuickAction
              href="/companies/create"
              icon={Building2}
              label="新建客户"
            />
            <QuickAction
              href="/deals/create"
              icon={FolderPlus}
              label="新建项目"
            />
            <QuickAction
              href="/follow_ups/create"
              icon={MessageSquareText}
              label="记录跟进"
            />
            <QuickAction
              href="/reminders/create"
              icon={BellRing}
              label="新建提醒"
            />
          </div>
        </section>
      </div>
    </div>
  );
};

const Metric = ({
  icon: Icon,
  label,
  value,
  urgent = false,
}: {
  icon: typeof BellRing;
  label: string;
  value: number;
  urgent?: boolean;
}) => (
  <div className="min-w-0 bg-background p-4">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className={urgent ? "size-4 text-destructive" : "size-4"} />
      <span className="truncate">{label}</span>
    </div>
    <p
      className={
        urgent
          ? "mt-2 text-2xl font-semibold text-destructive"
          : "mt-2 text-2xl font-semibold"
      }
    >
      {value}
    </p>
  </div>
);

const QuickAction = ({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof BellRing;
  label: string;
}) => (
  <Button asChild variant="outline" className="h-11 justify-start">
    <Link to={href}>
      <Icon className="size-4" />
      {label}
    </Link>
  </Button>
);

const EmptyLine = ({ text }: { text: string }) => (
  <p className="border-y py-8 text-center text-sm text-muted-foreground">
    {text}
  </p>
);

const DashboardLoading = () => (
  <div className="space-y-6 py-2" aria-label="正在加载工作台">
    <Skeleton className="h-16 w-full" />
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-24" />
      ))}
    </div>
    <Skeleton className="h-64 w-full" />
  </div>
);

const listParams = (field: string, order: "ASC" | "DESC" = "ASC") => ({
  filter: {},
  pagination: { page: 1, perPage: PAGE_SIZE },
  sort: { field, order },
});

const getReminderTime = (reminder: CustomerReminder) =>
  new Date(reminder.snooze_until ?? reminder.due_at).getTime();

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
