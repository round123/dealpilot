import {
  API_ERROR_CODES,
  ApiError,
  type BackupSnapshot,
} from "@dealpilot/api-client";
import { FileKey2, FileUp, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useNotify } from "ra-core";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { getCloudApiClient } from "../providers/apiClient";
import {
  createEncryptedBackupArchive,
  inspectEncryptedBackupArchive,
  type InspectedEncryptedBackup,
} from "./encryptedCloudBackup";

export const EncryptedBackupSection = ({
  onSnapshotCreated,
}: {
  onSnapshotCreated: (snapshot: BackupSnapshot) => void;
}) => {
  const notify = useNotify();
  const [exportPassword, setExportPassword] = useState("");
  const [exportPasswordConfirmation, setExportPasswordConfirmation] =
    useState("");
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState<File>();
  const [importPassword, setImportPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [inspected, setInspected] = useState<InspectedEncryptedBackup>();
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoring, setRestoring] = useState(false);

  const canExport =
    exportPassword.length >= 8 && exportPassword === exportPasswordConfirmation;

  const exportArchive = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const client = getCloudApiClient();
      const snapshot = await client.backups.create({ label: "加密文件备份" });
      const exported = await client.backups.exportPayload(snapshot.id);
      const archive = await createEncryptedBackupArchive(
        exported,
        exportPassword,
      );
      downloadBlob(
        archive,
        `dealpilot-cloud-backup-${fileTimestamp()}.dpcloud`,
      );
      onSnapshotCreated(snapshot);
      setExportPassword("");
      setExportPasswordConfirmation("");
      notify("加密备份已下载", { type: "success" });
    } catch (error) {
      notify(toBackupMessage(error, "加密备份创建失败，请重试"), {
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  const inspectArchive = async () => {
    if (!importFile || importPassword.length < 8) return;
    setChecking(true);
    setInspected(undefined);
    try {
      const result = await inspectEncryptedBackupArchive(
        importFile,
        importPassword,
      );
      setInspected(result);
      notify("备份预检通过", { type: "success" });
    } catch (error) {
      notify(toBackupMessage(error, "备份预检失败"), { type: "error" });
    } finally {
      setChecking(false);
    }
  };

  const restoreArchive = async () => {
    if (!inspected || restoreConfirmation.trim() !== "恢复加密备份") return;
    setRestoring(true);
    try {
      await getCloudApiClient().backups.restorePayload(inspected.restoreInput);
      notify("加密备份已恢复，正在刷新工作台", { type: "success" });
      setRestoreConfirmation("");
      setRestoreDialogOpen(false);
      setImportPassword("");
      setImportFile(undefined);
      setInspected(undefined);
      window.setTimeout(() => {
        window.location.hash = "/";
        window.location.reload();
      }, 400);
    } catch (error) {
      notify(toBackupMessage(error, "加密备份恢复失败，当前数据未改变"), {
        type: "error",
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <section
      className="space-y-5 border-t pt-5"
      aria-labelledby="encrypted-backup-title"
    >
      <div>
        <h3 id="encrypted-backup-title" className="text-sm font-semibold">
          加密备份文件
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          密码仅在当前浏览器中用于加密或解密，不会发送到云端。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="backup-export-password"
            className="text-sm font-medium"
          >
            备份密码
          </label>
          <Input
            id="backup-export-password"
            type="password"
            value={exportPassword}
            onChange={(event) => setExportPassword(event.target.value)}
            autoComplete="new-password"
            disabled={exporting}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="backup-export-password-confirmation"
            className="text-sm font-medium"
          >
            确认备份密码
          </label>
          <Input
            id="backup-export-password-confirmation"
            type="password"
            value={exportPasswordConfirmation}
            onChange={(event) =>
              setExportPasswordConfirmation(event.target.value)
            }
            autoComplete="new-password"
            disabled={exporting}
          />
        </div>
      </div>
      <Button
        type="button"
        onClick={exportArchive}
        disabled={!canExport || exporting}
      >
        {exporting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileKey2 className="size-4" />
        )}
        {exporting ? "正在加密..." : "创建并下载加密备份"}
      </Button>

      <div className="space-y-4 border-t pt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="encrypted-backup-file"
              className="text-sm font-medium"
            >
              加密备份文件
            </label>
            <Input
              id="encrypted-backup-file"
              type="file"
              accept=".dpcloud,application/vnd.dealpilot.cloud-backup+json,application/json"
              onChange={(event) => {
                setImportFile(event.target.files?.[0]);
                setInspected(undefined);
                setRestoreDialogOpen(false);
                setRestoreConfirmation("");
              }}
              disabled={checking || restoring}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="backup-import-password"
              className="text-sm font-medium"
            >
              文件密码
            </label>
            <Input
              id="backup-import-password"
              type="password"
              value={importPassword}
              onChange={(event) => {
                setImportPassword(event.target.value);
                setInspected(undefined);
                setRestoreDialogOpen(false);
                setRestoreConfirmation("");
              }}
              autoComplete="current-password"
              disabled={checking || restoring}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={inspectArchive}
            disabled={
              !importFile || importPassword.length < 8 || checking || restoring
            }
          >
            {checking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileUp className="size-4" />
            )}
            {checking ? "正在预检..." : "预检备份"}
          </Button>
          {inspected ? (
            <p className="text-sm text-muted-foreground">
              预检通过 · {countRows(inspected.rowCounts)} 条业务记录 ·{" "}
              {formatDate(inspected.createdAt)}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={!inspected || restoring}
          onClick={() => {
            setRestoreConfirmation("");
            setRestoreDialogOpen(true);
          }}
        >
          <RotateCcw className="size-4" />
          恢复加密备份
        </Button>
      </div>

      <RestoreEncryptedDialog
        open={restoreDialogOpen}
        confirmation={restoreConfirmation}
        restoring={restoring}
        onConfirmation={setRestoreConfirmation}
        onCancel={() => {
          setRestoreDialogOpen(false);
          setRestoreConfirmation("");
        }}
        onRestore={restoreArchive}
      />
    </section>
  );
};

const RestoreEncryptedDialog = ({
  open,
  confirmation,
  restoring,
  onConfirmation,
  onCancel,
  onRestore,
}: {
  open: boolean;
  confirmation: string;
  restoring: boolean;
  onConfirmation: (value: string) => void;
  onCancel: () => void;
  onRestore: () => void;
}) => (
  <Dialog
    open={open}
    onOpenChange={(next) => !next && !restoring && onCancel()}
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>确认恢复加密备份</DialogTitle>
        <DialogDescription>
          恢复会替换当前账号的业务数据，并在同一数据库事务中先创建安全快照。
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <label
          htmlFor="encrypted-backup-confirmation"
          className="text-sm font-medium"
        >
          输入“恢复加密备份”继续
        </label>
        <Input
          id="encrypted-backup-confirmation"
          value={confirmation}
          onChange={(event) => onConfirmation(event.target.value)}
          disabled={restoring}
          autoComplete="off"
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={restoring}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onRestore}
          disabled={confirmation !== "恢复加密备份" || restoring}
        >
          <RotateCcw className="size-4" />
          {restoring ? "正在恢复..." : "确认恢复"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const toBackupMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.code === API_ERROR_CODES.validation
    ? error.message
    : fallback;

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const fileTimestamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const countRows = (counts: Record<string, number>) =>
  Object.values(counts).reduce((total, count) => total + count, 0);
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
