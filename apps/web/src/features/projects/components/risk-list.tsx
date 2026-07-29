import { Plus, ArrowUp, AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { riskSeverityLabel, riskStatusLabel } from "@/lib/format";

interface Risk {
  id: string;
  description: string;
  severity: string;
  status: string;
  handled_at?: string | null;
  created_at?: string;
}

const SEVERITY_ICONS: Record<string, typeof AlertOctagon> = {
  high: AlertOctagon,
  critical: AlertOctagon,
  medium: AlertTriangle,
  low: Info,
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "var(--color-error)",
  critical: "var(--color-error)",
  medium: "var(--color-warning)",
  low: "var(--color-info)",
};

const STATUS_VARIANT: Record<string, "default" | "warning" | "success" | "info"> = {
  open: "default",
  handling: "warning",
  resolved: "success",
  ignored: "info",
};

export function RiskList({ risks }: { risks: Risk[] }) {
  return (
    <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">风险</h2>
        <Button variant="ghost" size="sm">
          <Plus size={16} />
          添加
        </Button>
      </div>

      {risks.length === 0 ? (
        <p className="text-sm text-text-tertiary py-4">暂无风险记录</p>
      ) : (
        <ul className="space-y-3">
          {risks.map((risk) => {
            const Icon = SEVERITY_ICONS[risk.severity] ?? Info;
            const color = SEVERITY_COLORS[risk.severity] ?? "var(--color-info)";
            const isOld = risk.created_at ? (Date.now() - new Date(risk.created_at).getTime()) / 86_400_000 > 7 && risk.status === "open" : false;
            return (
              <li key={risk.id} className="flex items-start gap-3 rounded-md border border-border-subtle p-3">
                <Icon size={20} style={{ color }} />
                <div className="flex-1">
                  <p className="text-sm text-text-primary">{risk.description}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[risk.status] ?? "default"}>
                      {riskStatusLabel(risk.status)}
                    </Badge>
                    <span className="text-xs text-text-tertiary">
                      {riskSeverityLabel(risk.severity)}
                    </span>
                    {isOld && (
                      <span className="flex items-center gap-0.5 text-xs" style={{ color: "var(--color-error)" }}>
                        <ArrowUp size={12} />
                        优先级已提升
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
