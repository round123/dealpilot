import { useRef, useState, type DragEvent } from "react";
import { ArchiveRestore, Lock, AlertTriangle, UploadCloud } from "lucide-react";
import { useBackupValidate, useBackupRestore } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BackupValidateResponse } from "@dealpilot/shared";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

export function BackupRestore() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [dragging, setDragging] = useState(false);
  const [validateResult, setValidateResult] = useState<BackupValidateResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const validateM = useBackupValidate();
  const restoreM = useBackupRestore();

  const handleFile = (f: File) => {
    setFile(f);
    setValidateResult(null);
  };

  const handleValidate = () => {
    if (!file || !password) return;
    validateM.mutate(
      { file, password },
      {
        onSuccess: (data) => {
          setValidateResult(data);
        },
      },
    );
  };

  const handleRestore = () => {
    if (!file || !password) return;
    setConfirmOpen(false);
    restoreM.mutate({ file, password });
  };

  return (
    <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <ArchiveRestore size={24} style={{ color: "var(--color-primary)" }} />
        <h2 className="text-lg font-semibold text-text-primary">恢复备份</h2>
      </div>

      <div className="space-y-4">
        <div
          onDrop={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-8 cursor-pointer transition-colors",
            dragging ? "border-border-focus bg-primary-lighter" : "border-border-strong bg-gray-50",
          )}
        >
          <UploadCloud size={36} style={{ color: "var(--color-gray-400)" }} />
          <p className="text-sm text-text-secondary">
            {file ? file.name : "选择 .dpbak 备份文件"}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".dpbak"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        <div>
          <Label>备份密码</Label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入备份密码"
              className="pl-9"
            />
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleValidate}
          disabled={!file || !password}
          loading={validateM.isPending}
          className="w-full"
        >
          校验备份
        </Button>

        {validateResult && (
          <div className="space-y-2 rounded-md border border-border-default p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">完整性</span>
              <span style={{ color: validateResult.integrity_ok ? "var(--color-success)" : "var(--color-error)" }}>
                {validateResult.integrity_ok ? "通过" : "损坏"}
              </span>
            </div>
            {validateResult.schema_version && (
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Schema 版本</span>
                <span className="text-text-primary">{validateResult.schema_version}</span>
              </div>
            )}
            {validateResult.app_version && (
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">应用版本</span>
                <span className="text-text-primary">{validateResult.app_version}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">兼容性</span>
              <span style={{ color: validateResult.valid ? "var(--color-success)" : "var(--color-error)" }}>
                {validateResult.valid ? "兼容" : "不兼容"}
              </span>
            </div>
          </div>
        )}

        <div
          className="flex items-start gap-2 rounded-md p-3 text-xs"
          style={{ backgroundColor: "var(--color-error-light)" }}
        >
          <AlertTriangle size={16} style={{ color: "var(--color-error)" }} className="flex-shrink-0 mt-0.5" />
          <p style={{ color: "var(--color-error-dark)" }}>
            恢复将覆盖当前全部业务数据，操作不可撤销。建议先创建当前数据备份
          </p>
        </div>

        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!validateResult?.valid || restoreM.isPending}
          loading={restoreM.isPending}
          className="w-full"
        >
          {restoreM.isPending ? "正在恢复... 请勿关闭窗口" : "校验并恢复"}
        </Button>

        {restoreM.isError && (
          <p className="text-sm text-error">恢复失败：{restoreM.error?.message}</p>
        )}
        {restoreM.data && (
          <p className="text-sm text-success">
            恢复成功，共恢复 {restoreM.data.rows_restored} 条数据
          </p>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title="确认恢复" description="此操作将覆盖当前全部业务数据，不可撤销。">
          <div>
            <Label>请输入 RESTORE 确认</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTORE"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button
              onClick={handleRestore}
              disabled={confirmText !== "RESTORE"}
            >
              确认恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
