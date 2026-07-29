/**
 * DealPilot Popup 根组件
 *
 * 展示前 5 条待办（GET /reminders/popup），
 * 按逾期/高风险/分级/到期时间排序展示，
 * 点击待办项跳转对应 WhatsApp/Telegram 会话，
 * 底部：新建客户快捷入口。
 *
 * 验收标准 AC-18: popup 待办按逾期/高风险/分级/到期时间排序
 */

import React, { useEffect, useState } from "react";
import {
  Compass,
  UserPlus,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { fetchPopupReminders } from "../../src/lib/api-client";
import { requestAgentStatus } from "../../src/lib/native-messaging";
import { NewCustomerPage } from "./new-customer";
import type { Reminder } from "@dealpilot/shared";
import { isOverdue, formatRelativeTime } from "@dealpilot/shared";
import { POPUP_REMINDER_LIMIT } from "@dealpilot/shared";

/** 分级颜色 */
const GRADE_COLORS: Record<string, string> = {
  A: "var(--color-grade-a)",
  B: "var(--color-grade-b)",
  C: "var(--color-grade-c)",
};

/** 状态颜色 */
const STATUS_COLORS: Record<string, string> = {
  pending: "var(--color-info)",
  overdue: "var(--color-error)",
  snoozed: "var(--color-warning)",
  completed: "var(--color-success)",
  ignored: "var(--color-gray-400)",
  replied: "var(--color-info)",
};

/** 骨架卡片 */
const SkeletonCard: React.FC = () => (
  <div style={{ padding: "12px", borderBottom: "1px solid var(--color-border-default)" }}>
    <div style={{ height: "14px", backgroundColor: "var(--color-gray-100)", borderRadius: "4px", marginBottom: "8px", width: "60%" }} />
    <div style={{ height: "12px", backgroundColor: "var(--color-gray-100)", borderRadius: "4px", width: "40%" }} />
  </div>
);

/** 单个待办卡片 */
const ReminderCard: React.FC<{ reminder: Reminder }> = ({ reminder }) => {
  const overdue = isOverdue(reminder.due_at);
  const isHighRisk = reminder.priority === "high" || reminder.priority === "urgent";

  const handleClick = () => {
    // 根据平台打开对应会话（这里简化为打开 WhatsApp/Telegram Web）
    // 实际应使用深链跳转
    const platform = "whatsapp"; // 实际应从 reminder 关联的社媒账号获取
    const url = platform === "whatsapp"
      ? "https://web.whatsapp.com/"
      : "https://web.telegram.org/";
    chrome.tabs.create({ url });
  };

  return (
    <div
      onClick={handleClick}
      style={{
        padding: "12px",
        cursor: "pointer",
        borderBottom: "1px solid var(--color-border-default)",
        borderLeft: overdue ? "3px solid var(--color-error)" : "3px solid transparent",
        position: "relative",
        transition: "background-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      {/* 第一行：客户名 + 分级 */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
          {reminder.customer_id.slice(0, 8)}
        </span>
        {isHighRisk && (
          <AlertOctagon size={12} style={{ color: "var(--color-error)", marginLeft: "auto" }} />
        )}
      </div>

      {/* 第二行：项目名 */}
      {reminder.project_id && (
        <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "4px" }}>
          项目: {reminder.project_id.slice(0, 8)}
        </div>
      )}

      {/* 第三行：到期时间 + 状态 */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontSize: "11px", color: overdue ? "var(--color-error)" : "var(--color-text-secondary)" }}>
          {formatRelativeTime(reminder.due_at)}
        </span>
        <span
          style={{
            padding: "1px 6px",
            borderRadius: "var(--radius-full)",
            backgroundColor: overdue ? "var(--color-error)" : STATUS_COLORS[reminder.status] ?? "var(--color-info)",
            color: "var(--color-text-inverse)",
            fontSize: "10px",
            fontWeight: 500,
          }}
        >
          {overdue ? "逾期" : reminder.status === "pending" ? "待处理" : reminder.status}
        </span>
      </div>
    </div>
  );
};

export default function App() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);

  /** 加载 popup 待办 */
  const loadReminders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPopupReminders();
      setReminders(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
    requestAgentStatus().then(setAgentRunning);
  }, []);

  // 新建客户页面
  if (showNewCustomer) {
    return <NewCustomerPage onBack={() => setShowNewCustomer(false)} />;
  }

  return (
    <div
      style={{
        width: "360px",
        height: "480px",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans)",
        backgroundColor: "var(--color-bg-page)",
        color: "var(--color-text-primary)",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          borderBottom: "1px solid var(--color-border-default)",
          backgroundColor: "var(--color-bg-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Compass size={18} style={{ color: "var(--color-primary)" }} />
          <span style={{ fontSize: "14px", fontWeight: 600 }}>待办</span>
        </div>
        <button
          onClick={() => setShowNewCustomer(true)}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="新建客户"
        >
          <UserPlus size={16} style={{ color: "var(--color-text-secondary)" }} />
        </button>
      </div>

      {/* 待办列表 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          Array.from({ length: POPUP_REMINDER_LIMIT }).map((_, i) => <SkeletonCard key={i} />)
        ) : error ? (
          <div style={{ padding: "24px", textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "var(--color-error)", marginBottom: "8px" }}>
              {error}
            </div>
            <button
              onClick={loadReminders}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--color-primary)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-primary)",
                color: "var(--color-text-inverse)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              重试
            </button>
          </div>
        ) : reminders.length === 0 ? (
          /* 空状态 */
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <CheckCircle2 size={32} style={{ color: "var(--color-success)", marginBottom: "12px" }} />
            <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "4px" }}>
              暂无待办
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
              全部已完成
            </div>
          </div>
        ) : (
          reminders.map((r) => <ReminderCard key={r.id} reminder={r} />)
        )}
      </div>

      {/* 底部操作栏 */}
      <div
        style={{
          height: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          borderTop: "1px solid var(--color-border-default)",
          backgroundColor: "var(--color-bg-card)",
        }}
      >
        <button
          onClick={() => chrome.tabs.create({ url: "http://127.0.0.1:31081/reminders" })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: "12px",
            color: "var(--color-text-secondary)",
          }}
        >
          查看全部
          <ArrowRight size={14} />
        </button>

        {/* Agent 状态指示 */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: agentRunning ? "var(--color-success)" : "var(--color-warning)",
            }}
          />
          <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>
            {agentRunning ? "Agent 运行中" : "Agent 未运行"}
          </span>
        </div>
      </div>
    </div>
  );
}
