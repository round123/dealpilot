import type { BackupSnapshot } from "@dealpilot/api-client";
import { DatabaseBackup, Download, RotateCcw, ShieldCheck } from "lucide-react";
import { useDataProvider, useNotify, type RaRecord } from "ra-core";
import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";

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

import { getCloudApiClient } from "../providers/apiClient";
import { EncryptedBackupSection } from "./EncryptedBackupSection";

const EXPORT_RESOURCES = [
  ["companies", "客户"],
  ["contacts", "联系人"],
  ["social_accounts", "社媒账号"],
  ["deals", "项目"],
  ["follow_ups", "跟进"],
  ["reminders", "提醒"],
  ["deal_risks", "项目风险"],
  ["deal_milestones", "项目里程碑"],
] as const;

type ExportRow = RaRecord & Record<string, unknown>;
type SpreadsheetRow = Record<string, unknown>;

export const CloudDataToolsPage = () => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [exporting, setExporting] = useState(false);
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupSnapshot>();
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoring, setRestoring] = useState(false);

  const loadBackups = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingBackups(true);
      try {
        const result = await getCloudApiClient().backups.list({
          pagination: { page: 1, perPage: 20 },
          sort: { field: "created_at", order: "desc" },
          signal,
        });
        setSnapshots(result.data);
      } catch (error) {
        if (!signal?.aborted) {
          notify(error instanceof Error ? error.message : "云端备份列表加载失败", {
            type: "error",
          });
        }
      } finally {
        if (!signal?.aborted) setLoadingBackups(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadBackups(controller.signal);
    return () => controller.abort();
  }, [loadBackups]);

  const exportCloudData = async () => {
    setExporting(true);
    try {
      const workbook = XLSX.utils.book_new();
      const counts: string[] = [];

      for (const [resource, label] of EXPORT_RESOURCES) {
        const result = await dataProvider.getList<ExportRow>(resource, {
          pagination: { page: 1, perPage: 10_000 },
          sort: { field: "created_at", order: "ASC" },
        });
        const rows = result.data.map(toExportRow);
        const sheet = XLSX.utils.json_to_sheet(
          rows.length ? rows : [{ "暂无数据": "" }],
        );
        XLSX.utils.book_append_sheet(workbook, sheet, label.slice(0, 31));
        counts.push(`${label} ${rows.length} 条`);
      }

      const metadata = XLSX.utils.json_to_sheet([
        { 字段: "导出时间", 值: new Date().toISOString() },
        { 字段: "数据来源", 值: "DealPilot Cloud / Supabase" },
        { 字段: "说明", 值: "仅包含当前账号在 RLS 授权范围内的数据" },
      ]);
      XLSX.utils.book_append_sheet(workbook, metadata, "导出说明");
      XLSX.writeFile(workbook, `dealpilot-cloud-export-${fileTimestamp()}.xlsx`);
      notify(`云端数据已导出：${counts.join("、")}`, { type: "success" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "云端数据导出失败，请重试", {
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  const createBackup = async () => {
    setCreatingBackup(true);
    try {
      const snapshot = await getCloudApiClient().backups.create({
        label: "手动备份",
      });
      setSnapshots((current) => [
        snapshot,
        ...current.filter((item) => item.id !== snapshot.id),
      ]);
      notify("云端备份已创建", { type: "success" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "云端备份创建失败", {
        type: "error",
      });
    } finally {
      setCreatingBackup(false);
    }
  };

  const restoreBackup = async () => {
    if (!restoreTarget || restoreConfirmation.trim() !== "恢复备份") return;
    setRestoring(true);
    try {
      await getCloudApiClient().backups.restore(restoreTarget.id);
      notify("云端备份已恢复，正在刷新工作台", { type: "success" });
      setRestoreTarget(undefined);
      setRestoreConfirmation("");
      window.setTimeout(() => {
        window.location.hash = "/";
        window.location.reload();
      }, 400);
    } catch (error) {
      notify(error instanceof Error ? error.message : "云端备份恢复失败", {
        type: "error",
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-muted-foreground">设置 / 云端数据</p>
        <h1 className="mt-1 text-2xl font-semibold">导出与数据管理</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="size-5" />
            导出云端业务数据
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            导出当前账号有权限访问的客户、联系人、社媒账号、项目、跟进、提醒、风险和里程碑。导出过程使用云端 RLS，其他账号的数据不会进入文件。
          </p>
          <Button onClick={exportCloudData} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "正在导出..." : "导出 Excel"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DatabaseBackup className="size-5" />
            云端备份与恢复
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              快照保存在当前账号的云端数据域中，不包含登录凭据和 Storage 附件文件。
            </p>
            <Button
              type="button"
              onClick={createBackup}
              disabled={creatingBackup || restoring}
              className="shrink-0"
            >
              <DatabaseBackup className="size-4" />
              {creatingBackup ? "正在创建..." : "创建云端备份"}
            </Button>
          </div>

          <div className="divide-y rounded-md border">
            {loadingBackups ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">
                正在加载备份...
              </p>
            ) : snapshots.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">
                尚未创建云端备份。
              </p>
            ) : (
              snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {snapshot.label || "云端备份"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatSnapshotDate(snapshot.created_at)}
                      {snapshot.row_counts
                        ? ` · ${countSnapshotRows(snapshot.row_counts)} 条业务记录`
                        : ""}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      SHA-256 {snapshot.checksum}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={restoring || creatingBackup}
                    onClick={() => setRestoreTarget(snapshot)}
                  >
                    <RotateCcw className="size-4" />
                    恢复
                  </Button>
                </div>
              ))
            )}
          </div>
          <EncryptedBackupSection
            onSnapshotCreated={(snapshot) =>
              setSnapshots((current) => [
                snapshot,
                ...current.filter((item) => item.id !== snapshot.id),
              ])
            }
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="size-5" />
            云端数据安全
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>PostgreSQL 是当前业务唯一事实源，浏览器不维护 SQLite 业务副本。</p>
          <p>云端数据库和 Storage 备份由 Supabase 项目策略管理；下载的导出文件请按敏感业务数据妥善保管。</p>
        </CardContent>
      </Card>

      <Dialog
        open={restoreTarget !== undefined}
        onOpenChange={(open) => {
          if (!open && !restoring) {
            setRestoreTarget(undefined);
            setRestoreConfirmation("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认恢复云端备份</DialogTitle>
            <DialogDescription>
              恢复会用所选快照替换当前账号的业务数据。系统会先保存一份当前状态的安全快照，整个恢复过程在同一数据库事务中完成。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="cloud-backup-confirmation" className="text-sm font-medium">
              输入“恢复备份”继续
            </label>
            <Input
              id="cloud-backup-confirmation"
              value={restoreConfirmation}
              onChange={(event) => setRestoreConfirmation(event.target.value)}
              disabled={restoring}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRestoreTarget(undefined);
                setRestoreConfirmation("");
              }}
              disabled={restoring}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={restoreConfirmation.trim() !== "恢复备份" || restoring}
              onClick={restoreBackup}
            >
              <RotateCcw className="size-4" />
              {restoring ? "正在恢复..." : "确认恢复"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

CloudDataToolsPage.path = "/settings/cloud-data";

const toExportRow = (record: ExportRow): SpreadsheetRow =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : value,
    ]),
  );

const fileTimestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

const formatSnapshotDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const countSnapshotRows = (counts: Record<string, number>) =>
  Object.values(counts).reduce((total, count) => total + count, 0);
