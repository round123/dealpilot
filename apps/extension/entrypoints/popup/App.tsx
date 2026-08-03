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

import React, { useEffect, useRef, useState } from "react";
import {
  Compass,
  UserPlus,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  BriefcaseBusiness,
  Users,
  LogOut,
} from "lucide-react";
import {
  extensionErrorMessage,
  fetchPopupReminders,
  getCloudSession,
  signInToCloud,
  signOutFromCloud,
  updateReminderStatus,
} from "../../src/lib/api-client";
import { NewCustomerPage } from "./new-customer";
import type { PopupReminder } from "@dealpilot/shared";
import type { AuthSession } from "@dealpilot/api-client";
import { isOverdue, formatRelativeTime } from "@dealpilot/shared";
import { POPUP_REMINDER_LIMIT } from "@dealpilot/shared";
import { openWorkbench } from "../../src/lib/workbench-links";
import { openReminderConversation, type ConversationLaunchMode } from "../../src/lib/conversation-links";
import { ReminderActions } from "../../src/components/reminder-actions";
import {
  createReminderActionAttemptStore,
  type ReminderAction,
} from "../../src/lib/reminder-actions";

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
const ReminderCard: React.FC<{
  reminder: PopupReminder;
  busy: boolean;
  actionError?: string | null;
  onAction: (reminder: PopupReminder, action: ReminderAction) => void;
}> = ({ reminder, busy, actionError, onAction }) => {
  const overdue = isOverdue(reminder.due_at);
  const isHighRisk = reminder.has_high_risk;
  const [launchStatus, setLaunchStatus] = useState<string | null>(null);

  const handleClick = async () => {
    setLaunchStatus(null);
    try {
      const mode: ConversationLaunchMode = await openReminderConversation(reminder);
      setLaunchStatus({
        direct: "已打开对应会话",
        platform_with_copy: "已打开平台，账号已复制",
        platform_without_copy: "已打开平台，请手动搜索账号",
        workbench: "未绑定平台账号，已打开提醒详情",
      }[mode]);
    } catch {
      setLaunchStatus("无法打开会话，请从工作台查看提醒");
    }
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") void handleClick();
      }}
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
          {reminder.customer_name}
        </span>
        {isHighRisk && (
          <AlertOctagon size={12} style={{ color: "var(--color-error)", marginLeft: "auto" }} />
        )}
      </div>

      {/* 第二行：项目名 */}
      {reminder.project_name && (
        <div style={{ fontSize: "11px", color: "var(--color-text-tertiary)", marginBottom: "4px" }}>
          项目: {reminder.project_name}
        </div>
      )}

      {isHighRisk && (
        <div style={{ fontSize: "11px", color: "var(--color-error)", marginBottom: "4px" }}>
          关联项目存在高风险
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
      {launchStatus && (
        <div aria-live="polite" style={{ marginTop: "4px", fontSize: "10px", color: "var(--color-text-secondary)" }}>
          {launchStatus}
        </div>
      )}
      <ReminderActions
        reminderType={reminder.type}
        busy={busy}
        colorPrefix="--color"
        error={actionError}
        onAction={(action) => onAction(reminder, action)}
      />
    </div>
  );
};

const CloudSignIn: React.FC<{
  onSignedIn: (session: AuthSession) => void;
}> = ({ onSignedIn }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      onSignedIn(await signInToCloud(email.trim(), password));
    } catch (cause) {
      setError(extensionErrorMessage(cause, "登录失败，请检查邮箱和密码"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ width: "360px", height: "480px", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "12px", fontFamily: "var(--font-sans)", background: "var(--color-bg-page)" }}>
      <strong style={{ fontSize: "18px" }}>登录 DealPilot</strong>
      <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>使用与云端工作台相同的账号</span>
      <label htmlFor="cloud-email" style={{ fontSize: "12px" }}>邮箱</label>
      <input id="cloud-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} style={{ padding: "9px" }} />
      <label htmlFor="cloud-password" style={{ fontSize: "12px" }}>密码</label>
      <input id="cloud-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} style={{ padding: "9px" }} />
      {error && <span style={{ fontSize: "12px", color: "var(--color-error)" }}>{error}</span>}
      <button type="submit" disabled={submitting} style={{ padding: "9px", border: 0, borderRadius: "var(--radius-md)", background: "var(--color-primary)", color: "white" }}>
        {submitting ? "正在登录..." : "登录"}
      </button>
    </form>
  );
};

export default function App() {
  const [reminders, setReminders] = useState<PopupReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [session, setSession] = useState<AuthSession | null>();
  const [busyReminderId, setBusyReminderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const reminderAttempts = useRef(createReminderActionAttemptStore()).current;

  /** 加载 popup 待办 */
  const loadReminders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPopupReminders();
      setReminders(data);
    } catch (err) {
      setError(extensionErrorMessage(err, "待办加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void getCloudSession()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    if (session) void loadReminders();
  }, [session]);

  const handleReminderAction = async (
    reminder: PopupReminder,
    action: ReminderAction,
  ) => {
    if (busyReminderId) return;
    const attempt = reminderAttempts.get(reminder.id, action);
    const snapshot = reminders;
    setBusyReminderId(reminder.id);
    setActionError(null);
    setReminders((current) => current.filter((item) => item.id !== reminder.id));

    try {
      await updateReminderStatus(
        reminder.id,
        attempt.update,
        attempt.idempotencyKey,
      );
      reminderAttempts.complete(reminder.id, action);
    } catch (error) {
      setReminders(snapshot);
      setActionError({
        id: reminder.id,
        message: extensionErrorMessage(error, "提醒处理失败"),
      });
    } finally {
      try {
        setReminders(await fetchPopupReminders());
      } catch {
        // Keep the optimistic result or exact rollback when reconciliation is unavailable.
      }
      setBusyReminderId(null);
    }
  };

  if (session === undefined) {
    return <div style={{ width: "360px", height: "480px", display: "grid", placeItems: "center" }}>正在检查登录状态...</div>;
  }
  if (session === null) return <CloudSignIn onSignedIn={setSession} />;

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
          <button
            onClick={() => void openWorkbench("home")}
            title="打开工作台"
            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex" }}
          >
            <Compass size={18} style={{ color: "var(--color-primary)" }} />
          </button>
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
          reminders.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r}
              busy={busyReminderId === r.id}
              actionError={actionError?.id === r.id ? actionError.message : null}
              onAction={(reminder, action) => void handleReminderAction(reminder, action)}
            />
          ))
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
          onClick={() => void openWorkbench("reminders")}
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

        <button
          onClick={() => void openWorkbench("customers")}
          title="客户"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", display: "flex", padding: "4px" }}
        >
          <Users size={15} />
        </button>
        <button
          onClick={() => void openWorkbench("projects")}
          title="项目"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", display: "flex", padding: "4px" }}
        >
          <BriefcaseBusiness size={15} />
        </button>

        <button
          type="button"
          title="退出登录"
          onClick={() => void signOutFromCloud().finally(() => setSession(null))}
          style={{ display: "flex", alignItems: "center", gap: "4px", border: "none", background: "transparent", cursor: "pointer" }}
        >
          <LogOut size={13} style={{ color: "var(--color-text-tertiary)" }} />
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "var(--color-success)",
            }}
          />
          <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>
            云端已连接
          </span>
        </button>
      </div>
    </div>
  );
}
