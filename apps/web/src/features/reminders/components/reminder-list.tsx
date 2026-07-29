import { useState } from "react";
import {
  Check,
  Clock,
  X,
  MoreHorizontal,
  ListTodo,
  MessageCircleMore,
  PauseCircle,
} from "lucide-react";
import { useReminders, useUpdateReminder } from "../api";
import type { Reminder } from "@dealpilot/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatDateTime, reminderTypeLabel, reminderStatusLabel, isOverdue } from "@/lib/format";
import { cn } from "@/lib/cn";

const TABS = [
  { key: undefined, label: "全部" },
  { key: "pending", label: "待处理" },
  { key: "waiting_reply", label: "等待回复" },
  { key: "overdue", label: "已逾期" },
  { key: "completed", label: "已完成" },
  { key: "ignored", label: "已忽略" },
];

const TYPE_ICONS: Record<string, typeof Clock> = {
  fixed_time: Clock,
  waiting_reply: MessageCircleMore,
  paused: PauseCircle,
};

const STATUS_VARIANT: Record<string, "info" | "warning" | "error" | "success" | "default"> = {
  pending: "info",
  waiting_reply: "warning",
  overdue: "error",
  completed: "success",
  ignored: "default",
  replied: "info",
  snoozed: "warning",
};

export function ReminderList() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>();

  const { data, isLoading } = useReminders({ status, cursor, limit: 50 });
  const updateM = useUpdateReminder();

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border-default">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => {
              setStatus(tab.key);
              setCursor(undefined);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              status === tab.key
                ? "border-b-2 text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
            style={status === tab.key ? { borderBottomColor: "var(--color-primary)" } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-text-tertiary py-8">加载中...</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <ListTodo size={48} style={{ color: "var(--color-gray-300)" }} />
          <p className="text-sm text-text-secondary">暂无待办</p>
          <p className="text-xs text-text-tertiary">全部已完成</p>
        </div>
      ) : (
        <ul className="space-y-2 max-w-[960px] mx-auto">
          {items.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onAction={(action) =>
                updateM.mutate({
                  id: reminder.id,
                  data: {
                    status: action,
                    snooze_until: action === "snoozed" ? new Date(Date.now() + 3600_000).toISOString() : undefined,
                  },
                })
              }
            />
          ))}
        </ul>
      )}

      {data?.next_cursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setCursor(data.next_cursor!)}>
            加载更多
          </Button>
        </div>
      )}
    </div>
  );
}

function ReminderCard({
  reminder,
  onAction,
}: {
  reminder: Reminder;
  onAction: (status: "completed" | "snoozed" | "ignored" | "replied") => void;
}) {
  const overdue = isOverdue(reminder.due_at) && reminder.status !== "completed";
  const Icon = TYPE_ICONS[reminder.type] ?? Clock;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border-default bg-bg-card p-4 shadow-xs",
        overdue && "border-l-4",
      )}
      style={overdue ? { borderLeftColor: "var(--color-error)" } : {}}
    >
      <input type="checkbox" className="rounded border-border-strong" />

      <Icon size={20} style={{ color: "var(--color-text-tertiary)" }} />

      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">
          客户 {reminder.customer_id.slice(0, 8)}
        </p>
        {reminder.project_id && (
          <p className="text-xs text-text-tertiary">
            项目 {reminder.project_id.slice(0, 8)}
          </p>
        )}
        <p className="text-xs text-text-secondary mt-0.5">
          {reminderTypeLabel(reminder.type)} · 到期 {formatDateTime(reminder.due_at)}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="text-xs"
          style={{ color: overdue ? "var(--color-error)" : "var(--color-text-secondary)" }}
        >
          {formatDateTime(reminder.due_at)}
        </span>
        <Badge variant={STATUS_VARIANT[reminder.status] ?? "default"}>
          {reminderStatusLabel(reminder.status)}
        </Badge>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          title="完成"
          onClick={() => onAction("completed")}
        >
          <Check size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="稍后"
          onClick={() => onAction("snoozed")}
        >
          <Clock size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="忽略"
          onClick={() => onAction("ignored")}
        >
          <X size={16} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onAction("replied")}>
              <Check size={16} />
              已收到回复
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
