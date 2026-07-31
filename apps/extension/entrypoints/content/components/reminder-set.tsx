/**
 * DealPilot 插件设置提醒组件
 *
 * 设置提醒 → POST /reminders
 * 支持三种类型：固定时间 / 等待客户回复 / 暂不跟进
 *
 * 验收标准 AC-17: 标记"等待客户回复"后不自动监听新消息，
 *                  用户手动确认"已收到回复"后状态流转为"待处理"
 */

import React, { useState } from "react";
import { Clock, Loader2, X } from "lucide-react";
import { createReminder, extensionErrorMessage } from "../../../src/lib/api-client";
import { ReminderType } from "@dealpilot/shared";

interface ReminderSetProps {
  customerId: string;
  projectId?: string;
  onSaved?: () => void;
  onClose?: () => void;
}

const BUTTON_STYLE = {
  primary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--dp-space-1)",
    padding: "var(--dp-space-2) var(--dp-space-3)",
    borderRadius: "var(--dp-radius-md)",
    border: "1px solid var(--dp-color-primary)",
    backgroundColor: "var(--dp-color-primary)",
    color: "var(--dp-color-text-inverse)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    flex: 1,
  },
  secondary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--dp-space-1)",
    padding: "var(--dp-space-2) var(--dp-space-3)",
    borderRadius: "var(--dp-radius-md)",
    border: "1px solid var(--dp-color-border-default)",
    backgroundColor: "var(--dp-color-bg-card)",
    color: "var(--dp-color-text-primary)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    flex: 1,
  },
} as const;

const TYPE_TAB_STYLE = (active: boolean) => ({
  flex: 1,
  padding: "var(--dp-space-2)",
  border: "none",
  borderBottom: active ? "2px solid var(--dp-color-primary)" : "2px solid transparent",
  backgroundColor: "transparent",
  color: active ? "var(--dp-color-primary)" : "var(--dp-color-text-secondary)",
  fontSize: "12px",
  fontWeight: active ? 600 : 400,
  cursor: "pointer",
});

const INPUT_STYLE = {
  width: "100%",
  padding: "var(--dp-space-2)",
  border: "1px solid var(--dp-color-border-default)",
  borderRadius: "var(--dp-radius-md)",
  fontSize: "13px",
  fontFamily: "var(--dp-font-sans)" as const,
};

export const ReminderSet: React.FC<ReminderSetProps> = ({
  customerId,
  projectId,
  onSaved,
  onClose,
}) => {
  const [type, setType] = useState<"fixed_time" | "waiting_reply" | "paused">("fixed_time");
  const [dueAt, setDueAt] = useState(() => {
    // 默认 1 小时后
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (type === ReminderType.FIXED_TIME && !dueAt) {
      setError("请选择到期时间");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        customer_id: customerId,
        project_id: projectId,
        type,
        priority,
        due_at: type === ReminderType.FIXED_TIME
          ? new Date(dueAt).toISOString()
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 等待回复/暂不跟进默认 24h 后
      };

      await createReminder(payload);
      onSaved?.();
    } catch (err) {
      setError(extensionErrorMessage(err, "提醒保存失败，可重试"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "var(--dp-space-3)",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "var(--dp-color-bg-card)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 顶部 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--dp-space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-2)" }}>
          <Clock size={16} style={{ color: "var(--dp-color-primary)" }} />
          <span style={{ fontSize: "14px", fontWeight: 600 }}>设置提醒</span>
        </div>
        <button
          onClick={onClose}
          style={{ border: "none", background: "transparent", cursor: "pointer", padding: "var(--dp-space-1)" }}
        >
          <X size={16} style={{ color: "var(--dp-color-text-tertiary)" }} />
        </button>
      </div>

      {/* 类型选择 */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--dp-color-border-default)", marginBottom: "var(--dp-space-3)" }}>
        <button style={TYPE_TAB_STYLE(type === "fixed_time")} onClick={() => setType("fixed_time")}>
          固定时间
        </button>
        <button style={TYPE_TAB_STYLE(type === "waiting_reply")} onClick={() => setType("waiting_reply")}>
          等待回复
        </button>
        <button style={TYPE_TAB_STYLE(type === "paused")} onClick={() => setType("paused")}>
          暂不跟进
        </button>
      </div>

      {type === "fixed_time" && (
        <div style={{ marginBottom: "var(--dp-space-3)" }}>
          <label style={{ display: "block", fontSize: "12px", color: "var(--dp-color-text-secondary)", marginBottom: "var(--dp-space-1)" }}>
            到期时间
          </label>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            style={INPUT_STYLE}
          />
        </div>
      )}

      {type === "waiting_reply" && (
        <div style={{ marginBottom: "var(--dp-space-3)", fontSize: "12px", color: "var(--dp-color-text-secondary)", padding: "var(--dp-space-2)", backgroundColor: "var(--dp-color-info-light)", borderRadius: "var(--dp-radius-md)" }}>
          标记"等待客户回复"后，系统不会自动监听新消息。当您手动确认"已收到回复"后，提醒状态将流转为"待处理"。
        </div>
      )}

      {type === "paused" && (
        <div style={{ marginBottom: "var(--dp-space-3)", fontSize: "12px", color: "var(--dp-color-text-secondary)", padding: "var(--dp-space-2)", backgroundColor: "var(--dp-color-gray-50)", borderRadius: "var(--dp-radius-md)" }}>
          暂不跟进：此客户将暂时从待办列表中移除，您可随时恢复。
        </div>
      )}

      {/* 优先级 */}
      <div style={{ marginBottom: "var(--dp-space-3)" }}>
        <label style={{ display: "block", fontSize: "12px", color: "var(--dp-color-text-secondary)", marginBottom: "var(--dp-space-1)" }}>
          优先级
        </label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          style={INPUT_STYLE}
        >
          <option value="low">低</option>
          <option value="normal">普通</option>
          <option value="high">高</option>
          <option value="urgent">紧急</option>
        </select>
      </div>

      {error && (
        <div
          style={{
            fontSize: "12px",
            color: "var(--dp-color-error)",
            backgroundColor: "var(--dp-color-error-light)",
            padding: "var(--dp-space-2)",
            borderRadius: "var(--dp-radius-md)",
            marginBottom: "var(--dp-space-2)",
          }}
        >
          {error}
        </div>
      )}

      {/* 底部按钮 */}
      <div style={{ marginTop: "auto", display: "flex", gap: "var(--dp-space-2)" }}>
        <button style={BUTTON_STYLE.secondary} onClick={onClose} disabled={loading}>
          取消
        </button>
        <button style={BUTTON_STYLE.primary} onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 size={14} /> : <Clock size={14} />}
          保存提醒
        </button>
      </div>
    </div>
  );
};
