import { CalendarCheck2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useOptimisticResourcePatch } from "./useOptimisticResourcePatch";

const RESOURCE = "deal_milestones";

export type DealMilestone = {
  id: Identifier;
  deal_id: Identifier;
  name: string;
  due_date: string;
  completed: boolean;
  created_at?: string;
  updated_at?: string;
};

type MilestoneDraft = Pick<DealMilestone, "name" | "due_date" | "completed">;

const emptyDraft = (): MilestoneDraft => ({
  name: "",
  due_date: new Date().toISOString().slice(0, 10),
  completed: false,
});

export const DealMilestones = ({ dealId }: { dealId: Identifier }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<Identifier>();
  const {
    data = [],
    isPending,
    error,
  } = useGetList<DealMilestone>(RESOURCE, {
    filter: { deal_id: dealId },
    pagination: { page: 1, perPage: 100 },
    sort: { field: "due_date", order: "ASC" },
  });
  const [create, createState] = useCreate();
  const [update, updateState] = useUpdate();
  const [remove, deleteState] = useDelete();
  const t = (key: string, fallback: string) =>
    translate(`resources.deals.milestones.${key}`, { _: fallback });
  const completionMutation = useOptimisticResourcePatch<DealMilestone>(
    RESOURCE,
    {
      onError: () =>
        notify("resources.deals.milestones.update_error", {
          type: "error",
          messageArgs: { _: "里程碑状态更新失败，已恢复原状态" },
        }),
    },
  );

  const createMilestone = (draft: MilestoneDraft) => {
    create(
      RESOURCE,
      { data: { deal_id: dealId, ...normalizeDraft(draft) } },
      {
        onSuccess: () => {
          setShowCreate(false);
          notify("resources.deals.milestones.created", {
            messageArgs: { _: "里程碑已添加" },
          });
        },
        onError: () =>
          notify("resources.deals.milestones.create_error", {
            type: "error",
            messageArgs: { _: "里程碑添加失败" },
          }),
      },
    );
  };

  const updateMilestone = (milestone: DealMilestone, draft: MilestoneDraft) => {
    update(
      RESOURCE,
      {
        id: milestone.id,
        data: normalizeDraft(draft),
        previousData: milestone,
      },
      {
        onSuccess: () => setEditingId(undefined),
        onError: () =>
          notify("resources.deals.milestones.update_error", {
            type: "error",
            messageArgs: { _: "里程碑更新失败" },
          }),
      },
    );
  };

  const toggleCompleted = (milestone: DealMilestone, completed: boolean) => {
    completionMutation.mutate({
      record: milestone,
      data: { completed },
    });
  };

  const deleteMilestone = (milestone: DealMilestone) => {
    remove(
      RESOURCE,
      { id: milestone.id, previousData: milestone },
      {
        mutationMode: "undoable",
        onSuccess: () =>
          notify("resources.deals.milestones.deleted", {
            undoable: true,
            messageArgs: { _: "里程碑已删除" },
          }),
      },
    );
  };

  return (
    <section className="border-t pt-5" aria-labelledby="deal-milestones-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="size-4 text-emerald-600" aria-hidden />
          <h3 id="deal-milestones-title" className="text-base font-semibold">
            {t("title", "项目里程碑")}
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
          {t("add", "添加里程碑")}
        </Button>
      </div>

      {showCreate ? (
        <MilestoneEditor
          idPrefix="new-milestone"
          initial={emptyDraft()}
          submitLabel={t("create", "保存里程碑")}
          pending={createState.isPending}
          onCancel={() => setShowCreate(false)}
          onSubmit={createMilestone}
        />
      ) : null}

      {isPending ? <Skeleton className="h-20 w-full" /> : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("load_error", "里程碑列表加载失败")}
          </AlertDescription>
        </Alert>
      ) : null}
      {!isPending && !error && data.length === 0 && !showCreate ? (
        <p className="py-4 text-sm text-muted-foreground">
          {t("empty", "暂无里程碑")}
        </p>
      ) : null}

      {data.length > 0 ? (
        <ul className="divide-y">
          {data.map((milestone) => (
            <li key={milestone.id} className="py-4">
              {editingId === milestone.id ? (
                <MilestoneEditor
                  idPrefix={`milestone-${milestone.id}`}
                  initial={milestone}
                  submitLabel={t("save", "保存修改")}
                  pending={updateState.isPending}
                  onCancel={() => setEditingId(undefined)}
                  onSubmit={(draft) => updateMilestone(milestone, draft)}
                />
              ) : (
                <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
                  <Checkbox
                    id={`milestone-completed-${milestone.id}`}
                    checked={milestone.completed}
                    disabled={completionMutation.isPending}
                    aria-label={t("toggle_completed", "切换里程碑完成状态")}
                    onCheckedChange={(checked) =>
                      toggleCompleted(milestone, checked === true)
                    }
                  />
                  <Label
                    htmlFor={`milestone-completed-${milestone.id}`}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <span
                      className={`block break-words text-sm font-medium ${
                        milestone.completed
                          ? "line-through text-muted-foreground"
                          : ""
                      }`}
                    >
                      {milestone.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("due", "截止")} {formatDate(milestone.due_date)}
                    </span>
                  </Label>
                  <div className="flex gap-1 sm:ml-auto">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("edit", "编辑里程碑")}
                      title={t("edit", "编辑里程碑")}
                      onClick={() => setEditingId(milestone.id)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("delete", "删除里程碑")}
                      title={t("delete", "删除里程碑")}
                      disabled={deleteState.isPending}
                      onClick={() => deleteMilestone(milestone)}
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

const MilestoneEditor = ({
  idPrefix,
  initial,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
}: {
  idPrefix: string;
  initial: MilestoneDraft;
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (draft: MilestoneDraft) => void;
}) => {
  const translate = useTranslate();
  const [draft, setDraft] = useState<MilestoneDraft>({ ...initial });
  const t = (key: string, fallback: string) =>
    translate(`resources.deals.milestones.${key}`, { _: fallback });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.due_date) return;
    onSubmit(draft);
  };

  return (
    <form
      className="mb-4 grid gap-3 rounded-md border p-3 sm:grid-cols-2"
      onSubmit={submit}
    >
      <div>
        <Label htmlFor={`${idPrefix}-name`}>{t("name", "里程碑名称")}</Label>
        <Input
          id={`${idPrefix}-name`}
          required
          value={draft.name}
          onChange={(event) =>
            setDraft((current) => ({ ...current, name: event.target.value }))
          }
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-due-date`}>
          {t("due_date", "截止日期")}
        </Label>
        <Input
          id={`${idPrefix}-due-date`}
          type="date"
          required
          value={draft.due_date}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              due_date: event.target.value,
            }))
          }
        />
      </div>
      <label className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          checked={draft.completed}
          onCheckedChange={(checked) =>
            setDraft((current) => ({
              ...current,
              completed: checked === true,
            }))
          }
        />
        <span className="text-sm">{t("completed", "已完成")}</span>
      </label>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          <X />
          {t("cancel", "取消")}
        </Button>
        <Button
          type="submit"
          disabled={pending || !draft.name.trim() || !draft.due_date}
        >
          <Save />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

const normalizeDraft = (draft: MilestoneDraft): MilestoneDraft => ({
  ...draft,
  name: draft.name.trim(),
});

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
