import { useState } from "react";
import { DatabaseBackup, Lock, ShieldAlert } from "lucide-react";
import { useBackupCreate } from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BackupCreate() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const createM = useBackupCreate();

  const strength = getPasswordStrength(password);
  const canSubmit = password.length >= 8 && password === confirm;

  const handleCreate = () => {
    createM.mutate(
      { password },
      {
        onSuccess: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `dealpilot-backup-${new Date().toISOString().slice(0, 10)}.dpbak`;
          a.click();
          URL.revokeObjectURL(url);
        },
      },
    );
  };

  return (
    <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <DatabaseBackup size={24} style={{ color: "var(--color-primary)" }} />
        <h2 className="text-lg font-semibold text-text-primary">创建加密备份</h2>
      </div>

      <p className="text-sm text-text-secondary mb-4">
        备份包含全部客户、联系人、项目、跟进和提醒数据，使用 Argon2id 派生密钥 + AES-256-GCM 加密
      </p>

      <div className="space-y-4">
        <div>
          <Label>备份密码</Label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              className="pl-9"
            />
          </div>
        </div>

        {password && (
          <div className="flex gap-1">
            {["弱", "中", "强"].map((label, i) => (
              <div
                key={label}
                className="h-1.5 flex-1 rounded-full"
                style={{
                  backgroundColor:
                    i < strength
                      ? strength === 1
                        ? "var(--color-error)"
                        : strength === 2
                          ? "var(--color-warning)"
                          : "var(--color-success)"
                      : "var(--color-gray-100)",
                }}
              />
            ))}
          </div>
        )}

        <div>
          <Label>确认密码</Label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再次输入密码"
              className="pl-9"
              error={confirm !== "" && confirm !== password}
            />
          </div>
          {confirm !== "" && confirm !== password && (
            <p className="mt-1 text-xs text-error">两次输入的密码不一致</p>
          )}
        </div>

        <div
          className="flex items-start gap-2 rounded-md p-3 text-xs"
          style={{ backgroundColor: "var(--color-warning-light)" }}
        >
          <ShieldAlert size={16} style={{ color: "var(--color-warning)" }} className="flex-shrink-0 mt-0.5" />
          <p style={{ color: "var(--color-warning-dark)" }}>
            密码丢失后无法恢复备份，请妥善保存
          </p>
        </div>

        <Button
          onClick={handleCreate}
          disabled={!canSubmit}
          loading={createM.isPending}
          className="w-full"
        >
          创建备份
        </Button>

        {createM.isError && (
          <p className="text-sm text-error">创建失败：{createM.error?.message}</p>
        )}
      </div>
    </div>
  );
}

function getPasswordStrength(password: string): number {
  if (password.length < 8) return 0;
  let score = 1;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 3);
}
