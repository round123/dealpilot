import { useFollowUps } from "../api";
import { formatDateTime, followUpTypeLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/skeleton";
import { MessageSquareText } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  message: "var(--color-primary)",
  call: "var(--color-success)",
  email: "var(--color-info)",
  chat: "var(--color-primary)",
  visit: "var(--color-warning)",
  note: "var(--color-gray-400)",
};

export function FollowUpTimeline({ customerId }: { customerId?: string; projectId?: string }) {
  const { data, isLoading } = useFollowUps({ customer_id: customerId, limit: 20 });

  if (isLoading) return <SkeletonCard lines={3} />;

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <MessageSquareText size={32} style={{ color: "var(--color-gray-300)" }} />
        <p className="text-sm text-text-secondary">暂无跟进记录</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-border-default pl-4">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            className="absolute -left-[22px] top-1 h-3 w-3 rounded-full border-2 border-bg-card"
            style={{ backgroundColor: TYPE_COLORS[item.type] ?? "var(--color-gray-400)" }}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">
              {formatDateTime(item.occurred_at)}
            </span>
            <Badge>{followUpTypeLabel(item.type)}</Badge>
            {item.message_direction && (
              <span className="text-xs text-text-tertiary">
                {item.message_direction === "inbound" ? "收到的消息" : "发出的消息"}
              </span>
            )}
          </div>
          {item.note && (
            <p className="mt-1 text-sm text-text-primary">{item.note}</p>
          )}
          {item.message_body && (
            <blockquote
              className="mt-2 rounded-md p-2 text-sm text-text-secondary"
              style={{
                backgroundColor: "var(--color-gray-50)",
                borderLeft: "3px solid var(--color-gray-300)",
              }}
            >
              {item.message_body}
            </blockquote>
          )}
        </li>
      ))}
    </ol>
  );
}
