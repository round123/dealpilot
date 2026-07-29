import { Plus, Circle, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

interface Milestone {
  id: string;
  name: string;
  date: string;
  completed: boolean;
  created_at?: string;
}

export function MilestoneList({
  milestones,
  onToggle,
}: {
  projectId: string;
  milestones: Milestone[];
  onToggle?: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">里程碑</h2>
        <Button variant="ghost" size="sm">
          <Plus size={16} />
          添加
        </Button>
      </div>

      {milestones.length === 0 ? (
        <p className="text-sm text-text-tertiary py-4">暂无里程碑</p>
      ) : (
        <ul className="space-y-2">
          {milestones.map((m) => {
            const daysUntil = (new Date(m.date).getTime() - Date.now()) / 86_400_000;
            const isUpcoming = !m.completed && daysUntil >= 0 && daysUntil <= 3;
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-md border border-border-subtle p-3">
                <button onClick={() => onToggle?.(m.id)} className="flex-shrink-0">
                  {m.completed ? (
                    <CircleCheck size={20} style={{ color: "var(--color-success)" }} />
                  ) : (
                    <Circle size={20} style={{ color: "var(--color-gray-400)" }} />
                  )}
                </button>
                <span
                  className="flex-1 text-sm"
                  style={{
                    color: m.completed
                      ? "var(--color-text-tertiary)"
                      : isUpcoming
                        ? "var(--color-warning)"
                        : "var(--color-text-primary)",
                    textDecoration: m.completed ? "line-through" : "none",
                  }}
                >
                  {m.name}
                </span>
                <span className="text-xs text-text-tertiary">
                  {formatDate(m.date)}
                </span>
                {isUpcoming && (
                  <span className="text-xs" style={{ color: "var(--color-warning)" }}>
                    即将到期
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
