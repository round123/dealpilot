import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Upload,
  UserPlus,
  FolderPlus,
  DatabaseBackup,
  HardDriveDownload,
  Users,
  MessageSquareText,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useStats, useTodayReminders, useOverdueReminders } from "../api";
import { useSettings } from "@/features/settings/api";
import { formatRelativeTime, isOverdue } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/skeleton";

export function DashboardPage() {
  const statsQ = useStats();
  const settingsQ = useSettings();
  const todayQ = useTodayReminders();
  const overdueQ = useOverdueReminders();

  const overdueCount = overdueQ.data?.items.length ?? 0;
  const todayReminders = todayQ.data?.items ?? [];
  const completedToday = todayReminders.filter((r) => r.status === "completed").length;

  return (
    <div className="space-y-6">
      {overdueCount > 0 && (
        <div
          className="flex items-center justify-between rounded-lg p-4"
          style={{
            backgroundColor: "var(--color-error-light)",
            borderLeft: "4px solid var(--color-error)",
          }}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} style={{ color: "var(--color-error)" }} />
            <span className="text-sm font-medium text-text-primary">
              {overdueCount} 条提醒已逾期
            </span>
          </div>
          <Link to="/reminders">
            <Button variant="outline" size="sm">
              去处理
            </Button>
          </Link>
        </div>
      )}

      <div className="rounded-xl bg-bg-card border border-border-default p-6 shadow-sm">
        <div className="flex gap-6">
          <div className="w-1/3 border-r border-border-default pr-6">
            <p className="text-sm text-text-secondary">今日待办</p>
            <p className="mt-1 text-3xl font-bold text-text-primary">
              {statsQ.data?.pending_reminders ?? 0}
            </p>
            <p className="mt-1 text-sm text-text-tertiary">
              已完成 {completedToday} / 共 {todayReminders.length}
            </p>
            <div className="mt-4 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${todayReminders.length > 0 ? (completedToday / todayReminders.length) * 100 : 0}%`,
                  backgroundColor: "var(--color-primary)",
                }}
              />
            </div>
          </div>
          <div className="flex-1">
            {todayQ.isLoading ? (
              <SkeletonCard lines={4} />
            ) : todayReminders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <CheckCircle2 size={24} style={{ color: "var(--color-success)" }} />
                <p className="text-sm text-text-secondary">今日无待办</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {todayReminders.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-md p-2 hover:bg-bg-hover cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-text-primary">
                        客户 {r.customer_id.slice(0, 8)}
                      </span>
                      {r.project_id && (
                        <span className="text-xs text-text-tertiary">
                          项目 {r.project_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary">
                        {formatRelativeTime(r.due_at)}
                      </span>
                      {isOverdue(r.due_at) ? (
                        <Badge variant="error">逾期</Badge>
                      ) : (
                        <Badge variant="warning">今日到期</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <QuickActionCard icon={Upload} title="导入客户" desc="批量导入 Excel/CSV" to="/customers/import" />
        <QuickActionCard icon={UserPlus} title="新建客户" desc="添加客户档案" to="/customers" />
        <QuickActionCard icon={FolderPlus} title="新建项目" desc="创建交易项目" to="/projects" />
        <QuickActionCard icon={DatabaseBackup} title="创建备份" desc="加密数据备份" to="/settings/backup" />
      </div>

      {shouldBackupReminder(settingsQ.data?.last_backup_at) && (
        <div
          className="flex items-center justify-between rounded-lg p-4"
          style={{ backgroundColor: "var(--color-warning-light)" }}
        >
          <div className="flex items-center gap-3">
            <HardDriveDownload size={20} style={{ color: "var(--color-warning)" }} />
            <span className="text-sm font-medium text-text-primary">
              已超过 7 天未创建加密备份，建议立即备份
            </span>
          </div>
          <Link to="/settings/backup">
            <Button variant="outline" size="sm">
              立即备份
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={Users}
          label="客户总数"
          value={statsQ.data?.total_customers}
          trend={0}
          loading={statsQ.isLoading}
        />
        <StatCard
          icon={MessageSquareText}
          label="跟进记录数"
          value={statsQ.data?.total_followups}
          trend={0}
          loading={statsQ.isLoading}
        />
        <StatCard
          icon={CheckCircle2}
          label="提醒完成率"
          value={statsQ.data ? `${Math.round(statsQ.data.completion_rate * 100)}%` : undefined}
          trend={0}
          loading={statsQ.isLoading}
        />
      </div>
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  title,
  desc,
  to,
}: {
  icon: typeof Upload;
  title: string;
  desc: string;
  to: string;
}) {
  return (
    <Link to={to}>
      <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-card p-4 shadow-xs hover:shadow-md transition-shadow cursor-pointer">
        <Icon size={24} style={{ color: "var(--color-primary)" }} />
        <div>
          <p className="text-sm font-medium text-text-primary">{title}</p>
          <p className="text-xs text-text-tertiary">{desc}</p>
        </div>
      </div>
    </Link>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  loading,
}: {
  icon: typeof Users;
  label: string;
  value?: number | string;
  trend: number;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <Icon size={20} style={{ color: "var(--color-text-tertiary)" }} />
        {trend !== 0 && (
          <span
            className="flex items-center gap-0.5 text-xs"
            style={{ color: trend > 0 ? "var(--color-success)" : "var(--color-error)" }}
          >
            {trend > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-text-primary">
        {loading ? "--" : value ?? "--"}
      </p>
      <p className="text-sm text-text-tertiary">{label}</p>
    </div>
  );
}

function shouldBackupReminder(lastBackupAt: string | null | undefined): boolean {
  if (!lastBackupAt) return true;
  const days = (Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000;
  return days > 7;
}
