import { AlertTriangle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  useCreate,
  useDelete,
  useGetList,
  useNotify,
  useTranslate,
  useUpdate,
  type Identifier,
} from "ra-core";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useOptimisticResourcePatch } from "./useOptimisticResourcePatch";

const RESOURCE = "deal_risks";
const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES = ["open", "handling", "resolved", "ignored"] as const;

type RiskSeverity = (typeof SEVERITIES)[number];
type RiskStatus = (typeof STATUSES)[number];

export type DealRisk = {
  id: Identifier;
  deal_id: Identifier;
  description: string;
  severity: RiskSeverity;
  status: RiskStatus;
  handled_at: string | null;
  created_at?: string;
  updated_at?: string;
};

type RiskDraft = Pick<
  DealRisk,
  "description" | "severity" | "status" | "handled_at"
>;

const emptyDraft = (): RiskDraft => ({
  description: "",
  severity: "medium",
  status: "open",
  handled_at: null,
});

export const DealRisks = ({ dealId }: { dealId: Identifier }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<Identifier>();
  const {
    data = [],
    isPending,
    error,
  } = useGetList<DealRisk>(RESOURCE, {
    filter: { deal_id: dealId },
    pagination: { page: 1, perPage: 100 },
    sort: { field: "created_at", order: "DESC" },
  });
  const [create, createState] = useCreate();
  const [update, updateState] = useUpdate();
  const [remove, deleteState] = useDelete();
  const t = (key: string, fallback: string) =>
    translate(`resources.deals.risks.${key}`, { _: fallback });
  const statusMutation = useOptimisticResourcePatch<DealRisk>(RESOURCE, {
    onError: () =>
      notify("resources.deals.risks.update_error", {
        type: "error",
        messageArgs: { _: "风险状态更新失败，已恢复原状态" },
      }),
  });

  const createRisk = (draft: RiskDraft) => {
    create(
      RESOURCE,
      {
        data: {
          deal_id: dealId,
          ...normalizeRiskDraft(draft),
        },
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          notify("resources.deals.risks.created", {
            messageArgs: { _: "风险已添加" },
          });
        },
        onError: () =>
          notify("resources.deals.risks.create_error", {
            type: "error",
            messageArgs: { _: "风险添加失败" },
          }),
      },
    );
  };

  const updateRisk = (risk: DealRisk, draft: RiskDraft) => {
    update(
      RESOURCE,
      {
        id: risk.id,
        data: normalizeRiskDraft(draft),
        previousData: risk,
      },
      {
        onSuccess: () => setEditingId(undefined),
        onError: () =>
          notify("resources.deals.risks.update_error", {
            type: "error",
            messageArgs: { _: "风险更新失败" },
          }),
      },
    );
  };

  const updateStatus = (risk: DealRisk, status: RiskStatus) => {
    const handledAt = isHandledStatus(status)
      ? (risk.handled_at ?? new Date().toISOString())
      : null;
    statusMutation.mutate({
      record: risk,
      data: { status, handled_at: handledAt },
    });
  };

  const deleteRisk = (risk: DealRisk) => {
    remove(
      RESOURCE,
      { id: risk.id, previousData: risk },
      {
        mutationMode: "undoable",
        onSuccess: () =>
          notify("resources.deals.risks.deleted", {
            undoable: true,
            messageArgs: { _: "风险已删除" },
          }),
      },
    );
  };

  return (
    <section className="border-t pt-5" aria-labelledby="deal-risks-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
          <h3 id="deal-risks-title" className="text-base font-semibold">
            {t("title", "项目风险")}
          </h3>
          <span className="text-sm text-muted-foreground">{data.length}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowCreate(true)}
          disabled={showCreate}
        >
          <Plus />
          {t("add", "添加风险")}
        </Button>
      </div>

      {showCreate ? (
        <RiskEditor
          idPrefix="new-risk"
          initial={emptyDraft()}
          submitLabel={t("create", "保存风险")}
          pending={createState.isPending}
          onCancel={() => setShowCreate(false)}
          onSubmit={createRisk}
        />
      ) : null}

      {isPending ? <Skeleton className="h-20 w-full" /> : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("load_error", "风险列表加载失败")}
          </AlertDescription>
        </Alert>
      ) : null}
      {!isPending && !error && data.length === 0 && !showCreate ? (
        <p className="py-4 text-sm text-muted-foreground">
          {t("empty", "暂无风险")}
        </p>
      ) : null}

      {data.length > 0 ? (
        <ul className="divide-y">
          {data.map((risk) => (
            <li key={risk.id} className="py-4">
              {editingId === risk.id ? (
                <RiskEditor
                  idPrefix={`risk-${risk.id}`}
                  initial={risk}
                  submitLabel={t("save", "保存修改")}
                  pending={updateState.isPending}
                  onCancel={() => setEditingId(undefined)}
                  onSubmit={(draft) => updateRisk(risk, draft)}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {risk.description}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        `severity.${risk.severity}`,
                        severityFallback(risk.severity),
                      )}
                      {risk.handled_at
                        ? ` · ${t("handled", "处理于")} ${formatDateTime(risk.handled_at)}`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <Label
                      className="sr-only"
                      htmlFor={`risk-status-${risk.id}`}
                    >
                      {t("update_status", "更新风险状态")}
                    </Label>
                    <select
                      id={`risk-status-${risk.id}`}
                      aria-label={t("update_status", "更新风险状态")}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={risk.status}
                      disabled={statusMutation.isPending}
                      onChange={(event) =>
                        updateStatus(risk, event.target.value as RiskStatus)
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(`status.${status}`, statusFallback(status))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1 sm:justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("edit", "编辑风险")}
                      title={t("edit", "编辑风险")}
                      onClick={() => setEditingId(risk.id)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("delete", "删除风险")}
                      title={t("delete", "删除风险")}
                      disabled={deleteState.isPending}
                      onClick={() => deleteRisk(risk)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

const RiskEditor = ({
  idPrefix,
  initial,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  initial: RiskDraft;
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (draft: RiskDraft) => void;
}) => {
  const translate = useTranslate();
  const [draft, setDraft] = useState<RiskDraft>({
    ...initial,
    handled_at: initial.handled_at ? toDateTimeLocal(initial.handled_at) : null,
  });
  const t = (key: string, fallback: string) =>
    translate(`resources.deals.risks.${key}`, { _: fallback });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.description.trim()) return;
    onSubmit(draft);
  };

  return (
    <form
      className="mb-4 grid gap-3 rounded-md border p-3 sm:grid-cols-2"
      onSubmit={submit}
    >
      <div className="sm:col-span-2">
        <Label htmlFor={`${idPrefix}-description`}>
          {t("description", "风险描述")}
        </Label>
        <Textarea
          id={`${idPrefix}-description`}
          required
          value={draft.description}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-severity`}>
          {t("severity_label", "严重程度")}
        </Label>
        <select
          id={`${idPrefix}-severity`}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={draft.severity}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              severity: event.target.value as RiskSeverity,
            }))
          }
        >
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {t(`severity.${severity}`, severityFallback(severity))}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-status`}>
          {t("status_label", "风险状态")}
        </Label>
        <select
          id={`${idPrefix}-status`}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={draft.status}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              status: event.target.value as RiskStatus,
            }))
          }
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`, statusFallback(status))}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${idPrefix}-handled-at`}>
          {t("handled_at", "处理时间")}
        </Label>
        <Input
          id={`${idPrefix}-handled-at`}
          type="datetime-local"
          value={draft.handled_at ?? ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              handled_at: event.target.value || null,
            }))
          }
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          <X />
          {t("cancel", "取消")}
        </Button>
        <Button type="submit" disabled={pending || !draft.description.trim()}>
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

const normalizeRiskDraft = (draft: RiskDraft): RiskDraft => ({
  ...draft,
  description: draft.description.trim(),
  handled_at: isHandledStatus(draft.status)
    ? draft.handled_at
      ? new Date(draft.handled_at).toISOString()
      : new Date().toISOString()
    : null,
});

const isHandledStatus = (status: RiskStatus) =>
  status === "resolved" || status === "ignored";

const toDateTimeLocal = (value: string) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const severityFallback = (severity: RiskSeverity) =>
  ({ low: "低", medium: "中", high: "高", critical: "严重" })[severity];

const statusFallback = (status: RiskStatus) =>
  ({
    open: "待处理",
    handling: "处理中",
    resolved: "已解决",
    ignored: "已忽略",
  })[status];
