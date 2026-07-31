/**
 * DealPilot 插件浮窗状态组件
 *
 * 包含：加载中、不支持场景、未命中、多候选 的 UI 状态组件。
 * 从 App.tsx 拆分以控制单文件行数。
 */

import React, { useState } from "react";
import {
  Ban,
  Users,
  CircleHelp,
  UserPlus,
  Link,
  Loader2,
} from "lucide-react";
import type { ConversationInfo } from "../../../src/lib/platform-detect";

/** 加载状态 */
export const LoadingState: React.FC = () => (
  <div style={{ padding: "var(--dp-space-6)", textAlign: "center" }}>
    <Loader2 size={24} style={{ color: "var(--dp-color-primary)", animation: "spin 1s linear infinite" }} />
    <div style={{ fontSize: "12px", color: "var(--dp-color-text-secondary)", marginTop: "var(--dp-space-2)" }}>
      正在识别客户...
    </div>
  </div>
);

/** 不支持场景：群组/频道 */
export const UnsupportedState: React.FC = () => (
  <div style={{ padding: "var(--dp-space-6)", textAlign: "center" }}>
    <Ban size={20} style={{ color: "var(--dp-color-gray-400)", marginBottom: "var(--dp-space-2)" }} />
    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--dp-color-text-primary)", marginBottom: "var(--dp-space-1)" }}>
      不支持自动识别
    </div>
    <div style={{ fontSize: "12px", color: "var(--dp-color-text-secondary)" }}>
      群组/频道会话不支持客户识别，请在一对一对话中使用
    </div>
  </div>
);

/** 未命中：新建或绑定 */
export const NoMatchState: React.FC<{
  conversation: ConversationInfo | null;
  onSearch: (customerId: string) => void;
  bindSearch: string;
  setBindSearch: (v: string) => void;
  bindLoading: boolean;
  onCreate: () => void;
}> = ({ conversation, bindSearch, setBindSearch, bindLoading, onCreate }) => {
  const [showBind, setShowBind] = useState(false);

  return (
    <div style={{ padding: "var(--dp-space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-2)", marginBottom: "var(--dp-space-3)" }}>
        <CircleHelp size={20} style={{ color: "var(--dp-color-text-tertiary)" }} />
        <span style={{ fontSize: "14px", fontWeight: 500 }}>未匹配到客户</span>
      </div>

      {conversation && (
        <div style={{ fontSize: "12px", color: "var(--dp-color-text-secondary)", marginBottom: "var(--dp-space-3)", padding: "var(--dp-space-2)", backgroundColor: "var(--dp-color-gray-50)", borderRadius: "var(--dp-radius-md)" }}>
          {conversation.conversationName}: {conversation.rawIdentifier}
        </div>
      )}

      {!showBind ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--dp-space-2)" }}>
          <button
            onClick={onCreate}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--dp-space-1)",
              padding: "var(--dp-space-2) var(--dp-space-3)", borderRadius: "var(--dp-radius-md)",
              border: "1px solid var(--dp-color-primary)", backgroundColor: "var(--dp-color-primary)",
              color: "var(--dp-color-text-inverse)", fontSize: "13px", fontWeight: 500, cursor: "pointer",
            }}
          >
            <UserPlus size={14} />
            新建客户
          </button>
          <button
            onClick={() => setShowBind(true)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--dp-space-1)",
              padding: "var(--dp-space-2) var(--dp-space-3)", borderRadius: "var(--dp-radius-md)",
              border: "1px solid var(--dp-color-border-default)", backgroundColor: "var(--dp-color-bg-card)",
              color: "var(--dp-color-text-primary)", fontSize: "13px", fontWeight: 500, cursor: "pointer",
            }}
          >
            <Link size={14} />
            绑定已有客户
          </button>
        </div>
      ) : (
        <div>
          <input
            value={bindSearch}
            onChange={(e) => setBindSearch(e.target.value)}
            placeholder="输入客户名称或公司搜索..."
            style={{
              width: "100%", padding: "var(--dp-space-2)",
              border: "1px solid var(--dp-color-border-default)",
              borderRadius: "var(--dp-radius-md)", fontSize: "13px", marginBottom: "var(--dp-space-2)",
            }}
          />
          <div style={{ fontSize: "12px", color: "var(--dp-color-text-tertiary)" }}>
            {bindLoading ? "绑定中..." : "输入客户 ID 进行绑定（演示）"}
          </div>
        </div>
      )}
    </div>
  );
};

/** 多候选匹配 */
export const MultipleMatchState: React.FC<{
  candidates: Array<{ id: string; name: string; company: string | null }>;
  onSelect: (customerId: string) => void;
  bindLoading: boolean;
}> = ({ candidates, onSelect, bindLoading }) => (
  <div style={{ padding: "var(--dp-space-3)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-2)", marginBottom: "var(--dp-space-3)" }}>
      <Users size={20} style={{ color: "var(--dp-color-primary)" }} />
      <span style={{ fontSize: "14px", fontWeight: 500 }}>
        找到 {candidates.length} 个匹配客户
      </span>
    </div>

    {candidates.map((c) => (
      <div
        key={c.id}
        style={{
          padding: "var(--dp-space-2)",
          border: "1px solid var(--dp-color-border-default)",
          borderRadius: "var(--dp-radius-md)", marginBottom: "var(--dp-space-2)",
        }}
      >
        <div style={{ fontSize: "13px", fontWeight: 500 }}>{c.name}</div>
        {c.company && <div style={{ fontSize: "12px", color: "var(--dp-color-text-secondary)" }}>{c.company}</div>}
        <button
          onClick={() => onSelect(c.id)} disabled={bindLoading}
          style={{
            marginTop: "var(--dp-space-2)", width: "100%", padding: "var(--dp-space-1) var(--dp-space-2)",
            border: "1px solid var(--dp-color-primary)", borderRadius: "var(--dp-radius-md)",
            backgroundColor: "var(--dp-color-primary)", color: "var(--dp-color-text-inverse)",
            fontSize: "12px", cursor: "pointer",
          }}
        >
          确认为此客户
        </button>
      </div>
    ))}
  </div>
);
