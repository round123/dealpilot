import { useParams } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useProject, useUpdateProjectStage } from "../api";
import { RiskList } from "./risk-list";
import { MilestoneList } from "./milestone-list";
import { Button } from "@/components/ui/button";
import { GradeBadge, StageBadge } from "@/components/ui/badge";
import { formatAmount, formatDate } from "@/lib/format";
import { SkeletonCard } from "@/components/skeleton";
import { ProjectStage } from "@dealpilot/shared";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

const STAGE_FLOW = [
  ProjectStage.LEAD,
  ProjectStage.QUALIFIED,
  ProjectStage.PROPOSAL,
  ProjectStage.NEGOTIATION,
];

const STAGE_LABELS: Record<string, string> = {
  lead: "需求确认",
  qualified: "方案/样品",
  proposal: "报价",
  negotiation: "谈判",
  closed_won: "成交",
  closed_lost: "失单",
};

export function ProjectDetail() {
  const { id } = useParams({ from: "/projects/$id" });
  const { data: project, isLoading } = useProject(id);
  const stageM = useUpdateProjectStage(id);
  const [confirmStage, setConfirmStage] = useState<string | null>(null);
  type StageKey = typeof ProjectStage[keyof typeof ProjectStage];

  if (isLoading) return <SkeletonCard lines={6} />;
  if (!project) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-text-secondary">项目不存在或已归档</p>
        <Link to="/projects">
          <Button variant="outline" size="md" className="mt-4">返回项目列表</Button>
        </Link>
      </div>
    );
  }

  const weightedAmount = project.amount !== null && project.probability !== null
    ? project.amount * (project.probability / 100)
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">{project.name}</h1>
            <Link to="/customers/$id" params={{ id: project.customer_id }} className="text-sm text-text-link hover:underline">
              客户 {project.customer_id.slice(0, 8)}
            </Link>
            <StageBadge stage={project.stage} />
            <GradeBadge grade={project.grade} />
          </div>
          <Button variant="ghost" size="icon">
            <Pencil size={16} />
          </Button>
        </div>

        <dl className="mt-4 grid grid-cols-4 gap-x-6 gap-y-3">
          <div>
            <dt className="text-xs text-text-tertiary">金额</dt>
            <dd className="text-sm font-medium text-text-primary">
              {formatAmount(project.amount, project.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-tertiary">成交概率</dt>
            <dd className="text-sm font-medium text-text-primary">
              {project.probability !== null ? `${project.probability}%` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-tertiary">预计成交日</dt>
            <dd className="text-sm font-medium text-text-primary">
              {formatDate(project.expected_close_date)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-tertiary">加权金额（参考值）</dt>
            <dd className="text-sm font-medium text-text-primary">
              {weightedAmount !== null ? formatAmount(weightedAmount, project.currency) : "-"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary mb-4">阶段流转</h2>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {STAGE_FLOW.map((stage, idx) => {
            const currentIdx = STAGE_FLOW.indexOf(project.stage as typeof STAGE_FLOW[number]);
            const isCurrent = project.stage === stage;
            const isPassed = currentIdx >= 0 && idx < currentIdx;
            return (
              <div key={stage} className="flex items-center gap-2">
                <button
                  onClick={() => stage !== project.stage && setConfirmStage(stage)}
                  className="flex-shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: isCurrent
                      ? "var(--color-primary)"
                      : isPassed
                        ? "var(--color-primary-light)"
                        : "var(--color-gray-100)",
                    color: isCurrent
                      ? "var(--color-text-inverse)"
                      : isPassed
                        ? "var(--color-primary)"
                        : "var(--color-text-tertiary)",
                  }}
                >
                  {STAGE_LABELS[stage]}
                </button>
                {idx < STAGE_FLOW.length - 1 && (
                  <div
                    className="h-px w-8"
                    style={{
                      backgroundColor: isPassed ? "var(--color-primary)" : "var(--color-border-default)",
                    }}
                  />
                )}
              </div>
            );
          })}
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmStage(ProjectStage.CLOSED_WON)}
              className="rounded-md px-3 py-2 text-sm font-medium"
              style={{
                backgroundColor: project.stage === ProjectStage.CLOSED_WON ? "var(--color-success)" : "var(--color-success-light)",
                color: project.stage === ProjectStage.CLOSED_WON ? "var(--color-text-inverse)" : "var(--color-success)",
              }}
            >
              成交
            </button>
            <button
              onClick={() => setConfirmStage(ProjectStage.CLOSED_LOST)}
              className="rounded-md px-3 py-2 text-sm font-medium"
              style={{
                backgroundColor: project.stage === ProjectStage.CLOSED_LOST ? "var(--color-error)" : "var(--color-error-light)",
                color: project.stage === ProjectStage.CLOSED_LOST ? "var(--color-text-inverse)" : "var(--color-error)",
              }}
            >
              失单
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <RiskList risks={project.risks ?? []} />
        <MilestoneList projectId={id} milestones={project.milestones ?? []} />
      </div>

      {(project.open_reminders ?? []).length > 0 && (
        <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-text-primary mb-4">关联待办</h2>
          <ul className="space-y-2">
            {(project.open_reminders ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2">
                <span className="text-sm text-text-primary">{r.type}</span>
                <span className="text-xs text-text-secondary">{r.due_at}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!confirmStage} onOpenChange={(open) => !open && setConfirmStage(null)}>
        <DialogContent title="确认切换阶段" description={`确认切换到「${confirmStage ? STAGE_LABELS[confirmStage] : ""}」？此操作会记录变更历史。`}>
          {confirmStage === ProjectStage.CLOSED_LOST && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-text-primary mb-1.5">失单原因</label>
              <textarea
                className="w-full rounded-md border border-border-default px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:border-border-focus"
                placeholder="请填写失单原因"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStage(null)}>取消</Button>
            <Button
              onClick={() => {
                if (confirmStage) {
                  stageM.mutate({ stage: confirmStage as StageKey }, { onSuccess: () => setConfirmStage(null) });
                }
              }}
              loading={stageM.isPending}
            >
              确认切换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
