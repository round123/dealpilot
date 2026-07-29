/**
 * DealPilot 插件标记跟进按钮组件
 *
 * 点击后读取当前会话选中的消息正文，调用 POST /follow-ups 保存为跟进记录。
 * 包含：标记消息 + 手动新建跟进两种入口。
 *
 * 验收标准 AC-11: 读取单条消息正文并保存为跟进记录，含时间/类型/备注/消息正文/客户/方向
 * 验收标准 AC-12: 保存失败保留内容可重试，重复提交不产生重复记录（Idempotency-Key）
 */

import React, { useState } from "react";
import { Bookmark, Plus, Loader2 } from "lucide-react";
import { createFollowUp } from "../../../src/lib/api-client";
import { getPlatformAdapter, type SelectedMessage } from "./platform-adapter";

interface FollowUpMarkerProps {
  customerId: string;
  /** 可选关联项目 ID */
  projectId?: string;
  /** 标记完成后的回调 */
  onSaved?: () => void;
}

/** 按钮样式 */
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

export const FollowUpMarker: React.FC<FollowUpMarkerProps> = ({
  customerId,
  projectId,
  onSaved,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [note, setNote] = useState("");

  /** 标记当前选中消息为跟进记录 */
  const handleMarkMessage = async () => {
    const adapter = getPlatformAdapter();
    if (!adapter) {
      setError("无法检测当前平台");
      return;
    }

    const selectedMsg = adapter.getSelectedMessage();
    if (!selectedMsg) {
      setError("未检测到选中的消息，请在会话中选择一条消息");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createFollowUp({
        customer_id: customerId,
        project_id: projectId,
        type: "message",
        message_body: selectedMsg.body,
        message_direction: selectedMsg.direction,
        occurred_at: selectedMsg.timestamp ?? new Date().toISOString(),
      });
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "保存失败，可重试";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  /** 手动新建跟进 */
  const handleManualSave = async () => {
    if (!note.trim()) {
      setError("请填写备注内容");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createFollowUp({
        customer_id: customerId,
        project_id: projectId,
        type: "note",
        note: note.trim(),
        occurred_at: new Date().toISOString(),
      });
      setNote("");
      setShowManual(false);
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "保存失败，可重试";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (showManual) {
    return (
      <div style={{ padding: "var(--dp-space-3)" }}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="输入跟进备注..."
          style={{
            width: "100%",
            minHeight: "60px",
            padding: "var(--dp-space-2)",
            border: "1px solid var(--dp-color-border-default)",
            borderRadius: "var(--dp-radius-md)",
            fontSize: "13px",
            fontFamily: "var(--dp-font-sans)",
            resize: "vertical",
            marginBottom: "var(--dp-space-2)",
          }}
        />
        {error && (
          <div style={{ fontSize: "12px", color: "var(--dp-color-error)", marginBottom: "var(--dp-space-2)" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--dp-space-2)" }}>
          <button
            style={BUTTON_STYLE.secondary}
            onClick={() => { setShowManual(false); setError(null); }}
            disabled={loading}
          >
            取消
          </button>
          <button
            style={BUTTON_STYLE.primary}
            onClick={handleManualSave}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} /> : <Plus size={14} />}
            保存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--dp-space-3)" }}>
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
      <div style={{ display: "flex", gap: "var(--dp-space-2)" }}>
        <button
          style={BUTTON_STYLE.primary}
          onClick={handleMarkMessage}
          disabled={loading}
        >
          {loading ? <Loader2 size={14} /> : <Bookmark size={14} />}
          标记消息
        </button>
        <button
          style={BUTTON_STYLE.secondary}
          onClick={() => setShowManual(true)}
          disabled={loading}
        >
          <Plus size={14} />
          新建跟进
        </button>
      </div>
    </div>
  );
};
