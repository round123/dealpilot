import {
  ApiError,
  V1_MIGRATION_COLLECTIONS,
  type V1MigrationBundle,
  type V1MigrationCollection,
  type V1MigrationReconcileResult,
} from "@dealpilot/api-client";
import { CheckCircle2, FileUp, ShieldAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNotify } from "ra-core";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

import { getCloudApiClient } from "../providers/apiClient";

const MAX_BUNDLE_BYTES = 100 * 1024 * 1024;
const CONFIRMATION_TEXT = "确认迁移";

const COLLECTION_LABELS: Record<V1MigrationCollection, string> = {
  companies: "客户",
  contacts: "联系人",
  social_accounts: "社媒账号",
  deals: "项目",
  follow_ups: "跟进",
  reminders: "提醒",
  deal_risks: "项目风险",
  deal_milestones: "项目里程碑",
  audit_events: "审计记录",
  deletion_snapshots: "删除快照",
};

interface SelectedBundle {
  fileName: string;
  fileSize: number;
  bundle: V1MigrationBundle;
}

interface UploadProgress {
  collection: V1MigrationCollection;
  completed: number;
  total: number;
}

export const V1MigrationSection = () => {
  const notify = useNotify();
  const abortController = useRef<AbortController | undefined>(undefined);
  const selectionVersion = useRef(0);
  const [selected, setSelected] = useState<SelectedBundle>();
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>();
  const [jobId, setJobId] = useState<string>();
  const [reconciliation, setReconciliation] =
    useState<V1MigrationReconcileResult>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(
    () => () => {
      selectionVersion.current += 1;
      abortController.current?.abort();
    },
    [],
  );

  const totalRecords = useMemo(
    () =>
      selected
        ? V1_MIGRATION_COLLECTIONS.reduce(
            (total, collection) =>
              total + selected.bundle.collections[collection].count,
            0,
          )
        : 0,
    [selected],
  );

  const resetJobState = () => {
    setJobId(undefined);
    setReconciliation(undefined);
    setProgress(undefined);
    setConfirmed(false);
    setConfirmOpen(false);
    setConfirmation("");
  };

  const selectBundle = async (file?: File) => {
    const version = selectionVersion.current + 1;
    selectionVersion.current = version;
    setSelected(undefined);
    resetJobState();
    if (!file) return;
    if (file.size > MAX_BUNDLE_BYTES) {
      notify("迁移包不能超过 100 MiB，请拆分源数据或重新生成迁移包", {
        type: "error",
      });
      return;
    }

    setReading(true);
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const bundle = await getCloudApiClient().migrations.parseBundle(raw);
      if (selectionVersion.current === version) {
        setSelected({ fileName: file.name, fileSize: file.size, bundle });
      }
    } catch (error) {
      if (selectionVersion.current === version) {
        notify(
          error instanceof SyntaxError
            ? "迁移包不是有效的 JSON 文件"
            : "迁移包校验失败，请使用 V1 迁移工具重新生成",
          { type: "error" },
        );
      }
    } finally {
      if (selectionVersion.current === version) setReading(false);
    }
  };

  const uploadAndReconcile = async () => {
    if (!selected) return;
    const controller = new AbortController();
    abortController.current = controller;
    setUploading(true);
    setProgress(undefined);
    setReconciliation(undefined);
    try {
      const result = await getCloudApiClient().migrations.upload(
        selected.bundle,
        {
          signal: controller.signal,
          onProgress: setProgress,
        },
      );
      setJobId(result.job.id);
      if (result.job.status === "confirmed") {
        setConfirmed(true);
        setProgress(undefined);
        notify("这份 V1 数据已经完成迁移，无需重复提交", { type: "info" });
      } else if (result.reconciliation?.ready) {
        setReconciliation(result.reconciliation);
        notify("迁移数据已上传，并通过数量和摘要核对", { type: "success" });
      } else {
        setReconciliation(result.reconciliation ?? undefined);
        notify("迁移数据核对未通过，请检查差异后重试", {
          type: "warning",
        });
      }
    } catch (error) {
      if (error instanceof ApiError && error.isAborted) {
        notify("已停止本次上传，可稍后使用同一迁移包继续", {
          type: "info",
        });
      } else {
        notify("迁移上传失败，原 SQLite 数据未被修改", { type: "error" });
      }
    } finally {
      if (abortController.current === controller) {
        abortController.current = undefined;
      }
      setUploading(false);
    }
  };

  const abandon = async () => {
    if (!jobId || confirmed) return;
    setAbandoning(true);
    try {
      await getCloudApiClient().migrations.abandon(jobId);
      resetJobState();
      notify("已放弃迁移并清理云端暂存数据", { type: "success" });
    } catch {
      notify("无法放弃迁移，请稍后重试", { type: "error" });
    } finally {
      setAbandoning(false);
    }
  };

  const confirm = async () => {
    if (
      !jobId ||
      !selected ||
      confirmed ||
      confirmation.trim() !== CONFIRMATION_TEXT
    ) {
      return;
    }
    setConfirming(true);
    try {
      await getCloudApiClient().migrations.confirm(jobId, selected.bundle);
      setConfirmed(true);
      setReconciliation(undefined);
      setProgress(undefined);
      setConfirmOpen(false);
      setConfirmation("");
      notify("V1 数据迁移已确认，PostgreSQL 现为唯一事实源", {
        type: "success",
      });
    } catch {
      notify("迁移确认失败，暂存数据尚未写入正式业务表", {
        type: "error",
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileUp className="size-5" />
            迁移 V1 本地数据
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            选择 V1 迁移工具生成的
            .bundle.json。上传只读取一致性快照，不会修改原
            SQLite；确认前可以放弃并清理云端暂存数据。
          </p>
          <div className="space-y-2">
            <label
              htmlFor="v1-migration-bundle"
              className="text-sm font-medium"
            >
              V1 迁移包
            </label>
            <Input
              id="v1-migration-bundle"
              type="file"
              accept=".json,application/json"
              disabled={
                reading ||
                uploading ||
                confirming ||
                abandoning ||
                !!jobId ||
                confirmed
              }
              onChange={(event) => void selectBundle(event.target.files?.[0])}
            />
            {jobId && !confirmed ? (
              <p className="text-xs text-muted-foreground">
                当前迁移任务已绑定此文件；如需更换，请先放弃迁移。
              </p>
            ) : null}
          </div>

          {selected ? (
            <div className="space-y-3 rounded-md border p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="truncate font-medium">{selected.fileName}</p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(selected.fileSize)} · 共 {totalRecords}{" "}
                  条待迁移记录
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {V1_MIGRATION_COLLECTIONS.map((collection) => (
                  <p key={collection} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {COLLECTION_LABELS[collection]}
                    </span>
                    <span>{selected.bundle.collections[collection].count}</span>
                  </p>
                ))}
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">
                快照 SHA-256 {selected.bundle.source.snapshot_sha256}
              </p>
            </div>
          ) : null}

          {uploading ? (
            <div className="space-y-2" aria-live="polite">
              <Progress
                value={
                  progress && progress.total > 0
                    ? (progress.completed / progress.total) * 100
                    : undefined
                }
              />
              <p className="text-sm text-muted-foreground">
                {progress
                  ? `正在上传${COLLECTION_LABELS[progress.collection]}：${progress.completed}/${progress.total}`
                  : "正在创建迁移任务..."}
              </p>
            </div>
          ) : null}

          {reconciliation?.ready ? (
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertTitle>核对通过，等待确认</AlertTitle>
              <AlertDescription>
                数量与摘要均一致。确认会在一个数据库事务中写入正式业务表，此后
                PostgreSQL 永久成为唯一事实源。
              </AlertDescription>
            </Alert>
          ) : null}

          {reconciliation && !reconciliation.ready ? (
            <Alert variant="destructive">
              <ShieldAlert className="size-4" />
              <AlertTitle>核对未通过</AlertTitle>
              <AlertDescription>
                {reconciliation.differences.length}
                个数据集合存在数量或摘要差异，请使用同一迁移包重试。
              </AlertDescription>
            </Alert>
          ) : null}

          {confirmed ? (
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertTitle>迁移已确认</AlertTitle>
              <AlertDescription>
                当前账号只使用 PostgreSQL 读写。SQLite 快照仅用于核对和取证。
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={uploadAndReconcile}
                disabled={!selected || reading || uploading || abandoning}
              >
                <FileUp className="size-4" />
                {reading
                  ? "正在校验..."
                  : reconciliation?.ready
                    ? "重新核对"
                    : "上传并核对"}
              </Button>
              {uploading ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => abortController.current?.abort()}
                >
                  停止上传
                </Button>
              ) : null}
              {jobId && reconciliation?.ready ? (
                <Button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={uploading || abandoning}
                >
                  <CheckCircle2 className="size-4" />
                  确认迁移
                </Button>
              ) : null}
              {jobId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={abandon}
                  disabled={uploading || abandoning}
                >
                  <XCircle className="size-4" />
                  {abandoning ? "正在放弃..." : "放弃迁移"}
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!confirming) {
            setConfirmOpen(open);
            if (!open) setConfirmation("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认 V1 数据迁移</DialogTitle>
            <DialogDescription>
              确认后 PostgreSQL 永久成为唯一事实源，不能切回 SQLite
              写入。请保留本地只读快照用于核对和取证。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="v1-migration-confirmation"
              className="text-sm font-medium"
            >
              输入“{CONFIRMATION_TEXT}”继续
            </label>
            <Input
              id="v1-migration-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={confirming}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={confirming}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={confirmation.trim() !== CONFIRMATION_TEXT || confirming}
              onClick={confirm}
            >
              <CheckCircle2 className="size-4" />
              {confirming ? "正在确认..." : "确认迁移"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};
