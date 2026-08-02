import type { DashboardPriorityReminder } from "@dealpilot/api-client";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  Building2,
  FolderPlus,
  MessageSquareText,
  Plus,
} from "lucide-react";
import { Link } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { getCloudApiClient } from "../providers/apiClient";

const DASHBOARD_SUMMARY_QUERY_KEY = ["dashboard", "summary"] as const;

export const DealPilotDashboard = () => {
  const summaryQuery = useQuery({
    queryKey: DASHBOARD_SUMMARY_QUERY_KEY,
    queryFn: ({ signal }) =>
      getCloudApiClient().dashboard.getSummary({ signal }),
    retry: false,
  });

  if (summaryQuery.isError) return <DashboardError />;
  if (summaryQuery.isPending) return <DashboardLoading />;

  const summary = summaryQuery.data;
  const now = new Date();

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
          value={summary.open_reminder_count}
        />
        <Metric
          icon={AlertTriangle}
          label="已逾期"
          value={summary.overdue_reminder_count}
          urgent={summary.overdue_reminder_count > 0}
        />
        <Metric
          icon={FolderPlus}
          label="高风险项目"
          value={summary.high_risk_deal_count}
          urgent={summary.high_risk_deal_count > 0}
        />
        <Metric
          icon={MessageSquareText}
          label="跟进记录"
          value={summary.follow_up_count}
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
          {summary.priority_reminders.length ? (
            <div className="divide-y border-y">
              {summary.priority_reminders.map((reminder) => {
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
                        {reminder.company_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {reminder.deal_name ? `${reminder.deal_name} · ` : ""}
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

const DashboardError = () => (
  <Alert variant="destructive" role="alert" className="my-4">
    <AlertTriangle />
    <AlertTitle>工作台数据加载失败</AlertTitle>
    <AlertDescription>
      暂时无法从云服务获取业务数据，请检查网络后刷新页面重试。
    </AlertDescription>
  </Alert>
);

const getReminderTime = (reminder: DashboardPriorityReminder) =>
  new Date(reminder.snooze_until ?? reminder.due_at).getTime();

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
