import { FolderOpen, Trash2, ShieldAlert } from "lucide-react";
import { useSettings, useUpdateSettings } from "../api";
import type { SettingsUpdate } from "@dealpilot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SkeletonCard } from "@/components/skeleton";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 rounded-full transition-colors"
      style={{ backgroundColor: checked ? "var(--color-primary)" : "var(--color-gray-300)" }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
        style={{ left: checked ? "22px" : "2px" }}
      />
    </button>
  );
}

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateM = useUpdateSettings();
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState("");

  if (isLoading) return <SkeletonCard lines={6} />;

  const handleToggle = (key: "auto_start" | "minimize_to_tray", value: boolean) => {
    updateM.mutate({ [key]: value } as SettingsUpdate);
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary mb-4">通用设置</h2>
        <div className="space-y-4">
          <div>
            <Label>语言</Label>
            <Select defaultValue="zh-CN">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-CN">简体中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>时区</Label>
            <Input value={Intl.DateTimeFormat().resolvedOptions().timeZone} readOnly className="bg-gray-100" />
            <p className="mt-1 text-xs text-text-tertiary">跟随系统</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary mb-4">启动与托盘</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">开机自启</p>
              <p className="text-xs text-text-tertiary">系统开机时自动启动 Agent</p>
            </div>
            <Toggle checked={settings?.auto_start ?? false} onChange={(v) => handleToggle("auto_start", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">最小化到系统托盘</p>
              <p className="text-xs text-text-tertiary">关闭窗口时保持 Agent 运行</p>
            </div>
            <Toggle checked={settings?.minimize_to_tray ?? false} onChange={(v) => handleToggle("minimize_to_tray", v)} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary mb-4">数据存储位置</h2>
        <div className="flex gap-2">
          <Input value="C:\\Users\\Administrator\\AppData\\Local\\DealPilot" readOnly className="bg-gray-100" />
          <Button variant="outline" size="md">
            <FolderOpen size={16} />
            更改位置
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-text-tertiary">客户</p>
            <p className="font-medium text-text-primary">0</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">跟进</p>
            <p className="font-medium text-text-primary">0</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">项目</p>
            <p className="font-medium text-text-primary">0</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">占用</p>
            <p className="font-medium text-text-primary">0 MB</p>
          </div>
        </div>

        <div className="mt-6 rounded-md border-2 p-4" style={{ borderColor: "var(--color-error)" }}>
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert size={16} style={{ color: "var(--color-error)" }} />
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-error)" }}>危险操作</h3>
          </div>
          <Button variant="danger" size="md" onClick={() => setClearOpen(true)}>
            <Trash2 size={16} />
            清空全部数据
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border-default bg-bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary mb-4">关于</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">版本</span>
            <span className="text-text-primary">0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Agent 状态</span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-success)" }} />
              运行中
            </span>
          </div>
          <Button variant="outline" size="sm" className="mt-2">
            检查更新
          </Button>
        </div>
      </div>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent title="确认清空全部数据" description="此操作将立即删除本地数据库且不可撤销。">
          <div>
            <Label>请输入 CLEAR 确认</Label>
            <Input
              value={clearText}
              onChange={(e) => setClearText(e.target.value)}
              placeholder="CLEAR"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>取消</Button>
            <Button variant="danger" disabled={clearText !== "CLEAR"}>
              <Trash2 size={16} />
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
