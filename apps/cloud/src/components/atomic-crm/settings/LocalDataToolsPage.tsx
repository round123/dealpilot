import {
  AlertTriangle,
  ArchiveRestore,
  DatabaseBackup,
  Download,
  FileWarning,
  HardDrive,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNotify } from "ra-core";
import type { Settings } from "@dealpilot/shared";

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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getErrorMessageKey } from "@/components/admin/error-message";

import {
  useLocalDataOperations,
  type BackupValidationResult,
  type LocalDataInfo,
} from "../providers/localDataOperations";
import { canRestoreValidatedBackup } from "./localDataRules";
import { LocalBackupStatus } from "./LocalBackupStatus";
import { LocalPrivacyNotice } from "./LocalPrivacyNotice";
import { UsageMetricsCard } from "./UsageMetricsCard";

export const LocalDataToolsPage = () => {
  const operations = useLocalDataOperations();

  if (!operations) {
    return (
      <div className="mx-auto mt-8 max-w-2xl px-4">
        <Alert>
          <AlertTriangle />
          <AlertTitle>本地数据工具不可用</AlertTitle>
          <AlertDescription>
            此页面只在连接 DealPilot 本地 Agent 时提供。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-muted-foreground">设置 / 本地数据</p>
        <h1 className="mt-1 text-2xl font-semibold">备份、恢复与全域导出</h1>
      </div>

      <LocalBackupStatus />
      <LocalPrivacyNotice />
      <UsageMetricsCard />
      <LocalDataOverview />
      <AgentPreferencesCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <CreateBackupCard />
        <RestoreBackupCard />
      </div>
      <ExportAllCard />
      <ClearLocalDataCard />
    </main>
  );
};

LocalDataToolsPage.path = "/settings/local-data";

const LocalDataOverview = () => {
  const operations = useLocalDataOperations()!;
  const [info, setInfo] = useState<LocalDataInfo | null>(null);
  const occupiedSize = info?.occupied_size_bytes ?? 0;
  const recoverySize = info?.recovery_size_bytes ?? 0;

  useEffect(() => {
    const controller = new AbortController();
    operations
      .getInfo({ signal: controller.signal })
      .then(setInfo)
      .catch(() => undefined);
    return () => controller.abort();
  }, [operations]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <HardDrive className="size-5" />
          本地数据位置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="local-data-path">SQLite 数据库</Label>
          <Input
            id="local-data-path"
            readOnly
            value={info?.data_path ?? "正在读取..."}
          />
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            数据库 {formatBytes(info?.database_size_bytes ?? 0)}，含 WAL/SHM
            的运行文件共占用 {formatBytes(occupiedSize)}
          </p>
          <p>
            迁移恢复点 {formatBytes(recoverySize)}，本地合计{" "}
            {formatBytes(occupiedSize + recoverySize)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

const AgentPreferencesCard = () => {
  const operations = useLocalDataOperations()!;
  const notify = useNotify();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [info, setInfo] = useState<LocalDataInfo | null>(null);
  const [days, setDays] = useState(7);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      operations.getSettings({ signal: controller.signal }),
      operations.getInfo({ signal: controller.signal }),
    ])
      .then(([nextSettings, nextInfo]) => {
        setSettings(nextSettings);
        setInfo(nextInfo);
        setDays(nextSettings.backup_reminder_days);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [operations]);

  const save = async (
    input: Parameters<typeof operations.updateSettings>[0],
  ) => {
    setPending(true);
    try {
      const updated = await operations.updateSettings(input);
      setSettings(updated);
      setDays(updated.backup_reminder_days);
      notify("Agent 设置已保存", { type: "success" });
    } catch (error) {
      notify(
        getErrorMessageKey(
          error,
          "设置未保存，请确认当前 Agent 版本支持此选项",
        ),
        { type: "error" },
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Agent 设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="auto-start">开机自启</Label>
            <p className="text-xs text-muted-foreground">
              {info?.auto_start_supported
                ? "登录 Windows 后自动启动"
                : "仅 Windows 安装版可启用"}
            </p>
          </div>
          <Switch
            id="auto-start"
            checked={settings?.auto_start ?? false}
            disabled={!settings || !info?.auto_start_supported || pending}
            onCheckedChange={(checked) => save({ auto_start: checked })}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="backup-reminder-days">备份提醒间隔（天）</Label>
            <Input
              id="backup-reminder-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </div>
          <Button
            variant="outline"
            disabled={
              pending || days < 1 || days > 365 || !Number.isInteger(days)
            }
            onClick={() => save({ backup_reminder_days: days })}
          >
            保存间隔
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const CreateBackupCard = () => {
  const operations = useLocalDataOperations()!;
  const notify = useNotify();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);

  const canCreate =
    password.length >= 8 && password === confirmation && !pending;

  const createBackup = async () => {
    if (!canCreate) return;
    setPending(true);
    try {
      const blob = await operations.createBackup(password);
      downloadBlob(blob, `dealpilot-backup-${fileTimestamp()}.dpbk`);
      setPassword("");
      setConfirmation("");
      notify("加密备份已创建并下载", { type: "success" });
    } catch (error) {
      notify(
        getErrorMessageKey(error, "创建备份失败，请确认密码至少 8 位后重试"),
        { type: "error" },
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <DatabaseBackup className="size-5" />
          创建加密备份
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          备份包含本机全部业务数据，并使用 Argon2id 与 AES-256-GCM 加密。
        </p>
        <PasswordField
          id="backup-password"
          label="备份密码"
          value={password}
          onChange={setPassword}
        />
        <PasswordField
          id="backup-password-confirmation"
          label="确认密码"
          value={confirmation}
          onChange={setConfirmation}
        />
        {confirmation && password !== confirmation ? (
          <p className="text-sm text-destructive">两次输入的密码不一致</p>
        ) : null}
        <Alert>
          <ShieldAlert />
          <AlertTitle>请妥善保管密码</AlertTitle>
          <AlertDescription>
            密码无法找回，丢失后备份将无法恢复。
          </AlertDescription>
        </Alert>
        <Button className="w-full" disabled={!canCreate} onClick={createBackup}>
          <Download className="size-4" />
          {pending ? "正在创建..." : "创建并下载备份"}
        </Button>
      </CardContent>
    </Card>
  );
};

const RestoreBackupCard = () => {
  const operations = useLocalDataOperations()!;
  const notify = useNotify();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState<BackupValidationResult | null>(
    null,
  );
  const [validating, setValidating] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoring, setRestoring] = useState(false);

  const resetValidation = () => {
    setValidation(null);
    setRestoreOpen(false);
    setRestoreConfirmation("");
  };

  const validate = async () => {
    if (!file || password.length < 8) return;
    setValidating(true);
    resetValidation();
    try {
      const result = await operations.validateBackup(file, password);
      setValidation(result);
      if (!result.valid || !result.integrity_ok) {
        notify("备份校验失败：密码错误或文件已损坏", { type: "error" });
      }
    } catch (error) {
      notify(getErrorMessageKey(error, "无法校验备份，请检查文件和密码"), {
        type: "error",
      });
    } finally {
      setValidating(false);
    }
  };

  const restore = async () => {
    if (
      !file ||
      !validation?.valid ||
      !validation.integrity_ok ||
      restoreConfirmation !== "RESTORE"
    ) {
      return;
    }
    setRestoring(true);
    try {
      const result = await operations.restoreBackup(
        file,
        password,
        restoreConfirmation,
      );
      if (!result.success) {
        notify("恢复未完成，当前 SQLite 数据未被替换", { type: "error" });
        return;
      }
      setRestoreOpen(false);
      notify(`恢复完成，共恢复 ${result.rows_restored} 条记录`, {
        type: "success",
      });
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      notify(getErrorMessageKey(error, "恢复失败，当前 SQLite 数据未被替换"), {
        type: "error",
      });
    } finally {
      setRestoring(false);
    }
  };

  const validationPassed = canRestoreValidatedBackup(validation);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArchiveRestore className="size-5" />
          恢复加密备份
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="restore-file">备份文件</Label>
          <Input
            id="restore-file"
            type="file"
            accept=".dpbk,.dpbak,application/octet-stream"
            disabled={validating || restoring}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              resetValidation();
            }}
          />
        </div>
        <PasswordField
          id="restore-password"
          label="恢复密码"
          value={password}
          disabled={validating || restoring}
          onChange={(value) => {
            setPassword(value);
            resetValidation();
          }}
        />
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>恢复会覆盖当前全部业务数据</AlertTitle>
          <AlertDescription>
            操作不可撤销。建议先下载一份当前数据的加密备份。
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          className="w-full"
          disabled={!file || password.length < 8 || validating || restoring}
          onClick={validate}
        >
          {validating ? "正在校验..." : "校验备份"}
        </Button>
        {validationPassed ? (
          <div className="space-y-3 rounded-md border border-success/40 bg-success/5 p-3">
            <p className="text-sm font-medium text-success">完整性校验通过</p>
            <p className="text-xs text-muted-foreground">
              应用版本：{validation?.app_version ?? "未知"}；备份格式版本：
              {validation?.schema_version ?? "未知"}
            </p>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setRestoreOpen(true)}
            >
              准备恢复
            </Button>
          </div>
        ) : validation ? (
          <p className="text-sm text-destructive">
            校验未通过，恢复操作已禁止。
          </p>
        ) : null}
      </CardContent>

      <Dialog
        open={restoreOpen}
        onOpenChange={(open) => {
          if (!restoring) setRestoreOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认覆盖当前 SQLite 数据</DialogTitle>
            <DialogDescription>
              这是不可撤销的危险操作。请输入 RESTORE 后才能继续。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="restore-confirmation">确认文字</Label>
            <Input
              id="restore-confirmation"
              autoComplete="off"
              value={restoreConfirmation}
              onChange={(event) => setRestoreConfirmation(event.target.value)}
              placeholder="RESTORE"
              disabled={restoring}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={restoring}
              onClick={() => setRestoreOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={restoreConfirmation !== "RESTORE" || restoring}
              onClick={restore}
            >
              {restoring ? "正在恢复，请勿关闭窗口..." : "确认恢复"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const ExportAllCard = () => {
  const operations = useLocalDataOperations()!;
  const notify = useNotify();
  const [pending, setPending] = useState(false);

  const exportAll = async () => {
    setPending(true);
    try {
      const blob = await operations.exportAll();
      downloadBlob(blob, `dealpilot-all-data-${fileTimestamp()}.xlsx`);
      notify("全部业务数据已导出", { type: "success" });
    } catch (error) {
      notify(getErrorMessageKey(error, "导出失败，请确认本地 Agent 正在运行"), {
        type: "error",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileWarning className="size-5" />
          导出明文 Excel
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          导出客户、联系人、社媒账号、项目、跟进、提醒、风险和里程碑。Excel
          不加密，请妥善保管。
        </p>
        <Button className="shrink-0" disabled={pending} onClick={exportAll}>
          <Download className="size-4" />
          {pending ? "正在导出..." : "导出全部数据"}
        </Button>
      </CardContent>
    </Card>
  );
};

const ClearLocalDataCard = () => {
  const operations = useLocalDataOperations()!;
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);

  const clearData = async () => {
    if (confirmation !== "CLEAR ALL DATA") return;
    setPending(true);
    try {
      const result = await operations.clearData(confirmation);
      notify(`已清空 ${result.deleted_records} 条本地记录，外部备份未受影响`, {
        type: "success",
      });
      setOpen(false);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      notify(getErrorMessageKey(error, "清空失败，原有本地数据保持不变"), {
        type: "error",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="border-destructive/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-destructive">
          <ShieldAlert className="size-5" />
          危险操作
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          清空 SQLite 中的全部业务与导入记录。已下载到其他位置的备份文件会保留。
        </p>
        <Button
          variant="destructive"
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-4" />
          清空全部数据
        </Button>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (pending) return;
          setOpen(nextOpen);
          if (!nextOpen) setConfirmation("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>再次确认清空全部本地数据</DialogTitle>
            <DialogDescription>
              此操作不可撤销。请先确认已下载可用备份，再输入 CLEAR ALL DATA。
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>所有客户、项目、跟进和提醒都会被删除</AlertTitle>
            <AlertDescription>
              任何一步失败时，Agent 会恢复原有数据库文件。
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="clear-data-confirmation">确认文字</Label>
            <Input
              id="clear-data-confirmation"
              autoComplete="off"
              value={confirmation}
              placeholder="CLEAR ALL DATA"
              disabled={pending}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={pending || confirmation !== "CLEAR ALL DATA"}
              onClick={clearData}
            >
              <Trash2 className="size-4" />
              {pending ? "正在清空..." : "确认清空"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const PasswordField = ({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      type="password"
      autoComplete="new-password"
      minLength={8}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>
);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
