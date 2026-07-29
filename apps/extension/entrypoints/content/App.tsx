/**
 * DealPilot 插件浮窗根组件
 *
 * 进入一对一会话后：
 * 1. 调用 POST /matches/resolve 识别客户
 * 2. 唯一命中：展示客户档案摘要
 * 3. 多候选：展示候选列表，用户选择绑定
 * 4. 未命中：提供新建或绑定入口
 * 5. 群组/频道/无法识别：显示"不支持自动识别"
 *
 * 验收标准：
 * - AC-07: 进入一对一会话 P95 <= 1 秒识别
 * - AC-08: 多匹配停止自动匹配并展示候选
 * - AC-09: 允许人工绑定
 * - AC-10: 群组/频道显示"不支持"
 */

import React, { useEffect, useState, useCallback } from "react";
import { ChevronDown, Compass, AlertCircle, Clock, Bell } from "lucide-react";
import { useExtensionStore } from "../../src/stores/extension-store";
import { resolveMatch, bindMatch, fetchFollowUps, fetchRemindersByCustomer } from "../../src/lib/api-client";
import { onConversationChange, type ConversationInfo } from "../../src/lib/platform-detect";
import { CustomerCard } from "./components/customer-card";
import { FollowUpMarker } from "./components/follow-up-marker";
import { ReminderSet } from "./components/reminder-set";
import { LoadingState, UnsupportedState, NoMatchState, MultipleMatchState } from "./components/match-states";
import type { FollowUp, Reminder } from "@dealpilot/shared";
import { isOverdue, formatRelativeTime } from "@dealpilot/shared";

/** 提醒类型图标 */
const REMINDER_ICON = <Clock size={12} />;

/** 状态 Tag 颜色 */
const STATUS_COLORS: Record<string, string> = {
  pending: "var(--dp-color-info)", overdue: "var(--dp-color-error)",
  snoozed: "var(--dp-color-warning)", completed: "var(--dp-color-success)",
  ignored: "var(--dp-color-gray-400)", replied: "var(--dp-color-info)",
};

/** 未完成提醒列表 */
const ReminderList: React.FC<{ reminders: Reminder[] }> = ({ reminders }) => (
  <div style={{ padding: "var(--dp-space-3)", borderTop: "1px solid var(--dp-color-border-default)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-1)", marginBottom: "var(--dp-space-2)" }}>
      <Bell size={14} style={{ color: "var(--dp-color-warning)" }} />
      <span style={{ fontSize: "13px", fontWeight: 500 }}>未完成提醒 {reminders.length}</span>
    </div>
    {reminders.map((r) => {
      const overdue = isOverdue(r.due_at);
      const color = overdue ? "var(--dp-color-error)" : STATUS_COLORS[r.status] ?? "var(--dp-color-info)";
      return (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-2)", padding: "var(--dp-space-1) 0", fontSize: "12px" }}>
          {REMINDER_ICON}
          <span style={{ color: "var(--dp-color-text-secondary)" }}>{formatRelativeTime(r.due_at)}</span>
          <span style={{ marginLeft: "auto", padding: "2px 6px", borderRadius: "var(--dp-radius-full)", backgroundColor: color, color: "var(--dp-color-text-inverse)", fontSize: "10px" }}>
            {overdue ? "逾期" : r.status}
          </span>
        </div>
      );
    })}
  </div>
);

/** 唯一命中内容 */
const UniqueMatchContent: React.FC<{
  customer: { id: string; name: string; company: string | null; country: string | null; source: string | null; grade: string };
  followUps: FollowUp[];
  reminders: Reminder[];
  onSetReminder: () => void;
}> = ({ customer, followUps, reminders, onSetReminder }) => {
  const lastFu = followUps[0];
  return (
    <div>
      <CustomerCard
        customer={customer as any}
        lastFollowUpAt={lastFu?.occurred_at ?? null}
        lastFollowUpNote={lastFu?.note ?? lastFu?.message_body ?? null}
      />
      {reminders.length > 0 && <ReminderList reminders={reminders} />}
      <div style={{ borderTop: "1px solid var(--dp-color-border-default)" }}>
        <FollowUpMarker customerId={customer.id} />
        <div style={{ padding: "0 var(--dp-space-3) var(--dp-space-3)" }}>
          <button
            onClick={onSetReminder}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--dp-space-1)",
              padding: "var(--dp-space-2) var(--dp-space-3)", borderRadius: "var(--dp-radius-md)",
              border: "1px solid var(--dp-color-border-default)", backgroundColor: "var(--dp-color-bg-card)",
              color: "var(--dp-color-text-primary)", fontSize: "13px", fontWeight: 500, cursor: "pointer",
            }}
          >
            <Clock size={14} />
            设置提醒
          </button>
        </div>
      </div>
    </div>
  );
};

export const FloatApp: React.FC = () => {
  const store = useExtensionStore();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showReminder, setShowReminder] = useState(false);
  const [bindSearch, setBindSearch] = useState("");
  const [bindLoading, setBindLoading] = useState(false);

  const doMatch = useCallback(async (conv: ConversationInfo) => {
    if (!conv.isOneOnOne) { store.setMatchState("unsupported"); return; }
    store.setMatchLoading();
    try {
      const result = await resolveMatch({ platform: conv.platform, raw_identifier: conv.rawIdentifier });
      store.setMatchResult(result);
      if (result.status === "unique" && result.customer) {
        const [fu, rm] = await Promise.all([
          fetchFollowUps(result.customer.id, 1),
          fetchRemindersByCustomer(result.customer.id),
        ]);
        setFollowUps(fu.items);
        setReminders(rm.items.filter((r) => r.status !== "completed" && r.status !== "ignored"));
      }
    } catch (err) {
      store.setError(err instanceof Error ? err.message : "匹配失败");
    }
  }, [store]);

  useEffect(() => {
    const unsub = onConversationChange((conv) => {
      store.setConversation(conv);
      if (conv) doMatch(conv);
      else store.setMatchState("unsupported");
    });
    return unsub;
  }, [doMatch, store]);

  const handleBind = async (customerId: string) => {
    if (!store.conversation) return;
    setBindLoading(true);
    try {
      await bindMatch({
        platform: store.conversation.platform,
        raw_identifier: store.conversation.rawIdentifier,
        customer_id: customerId,
      });
      doMatch(store.conversation);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : "绑定失败");
    } finally {
      setBindLoading(false);
    }
  };

  if (!store.expanded) {
    return (
      <div
        onClick={() => store.setExpanded(true)}
        style={{
          width: "48px", height: "48px", borderRadius: "var(--dp-radius-full)",
          backgroundColor: "var(--dp-color-primary)", display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", boxShadow: "var(--dp-shadow-lg)",
        }}
      >
        <Compass size={24} style={{ color: "var(--dp-color-text-inverse)" }} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%", maxHeight: "480px", backgroundColor: "var(--dp-color-bg-card)",
        borderRadius: "var(--dp-radius-lg)", boxShadow: "var(--dp-shadow-lg)", overflow: "hidden",
        display: "flex", flexDirection: "column", position: "relative",
      }}
    >
      {/* 顶部条 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--dp-space-2) var(--dp-space-3)", borderBottom: "1px solid var(--dp-color-border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-2)" }}>
          <Compass size={16} style={{ color: "var(--dp-color-primary)" }} />
          <span style={{ fontSize: "13px", fontWeight: 600 }}>DealPilot</span>
        </div>
        <button onClick={() => store.setExpanded(false)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: "var(--dp-space-1)" }}>
          <ChevronDown size={16} style={{ color: "var(--dp-color-text-tertiary)" }} />
        </button>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {store.matchState === "loading" && <LoadingState />}
        {store.matchState === "unsupported" && <UnsupportedState />}
        {store.matchState === "none" && (
          <NoMatchState conversation={store.conversation} onSearch={handleBind} bindSearch={bindSearch} setBindSearch={setBindSearch} bindLoading={bindLoading} />
        )}
        {store.matchState === "multiple" && (
          <MultipleMatchState candidates={store.candidates} onSelect={handleBind} bindLoading={bindLoading} />
        )}
        {store.matchState === "unique" && store.currentCustomer && (
          <UniqueMatchContent customer={store.currentCustomer} followUps={followUps} reminders={reminders} onSetReminder={() => setShowReminder(true)} />
        )}
        {store.error && (
          <div style={{ padding: "var(--dp-space-3)", fontSize: "12px", color: "var(--dp-color-error)" }}>
            <AlertCircle size={14} style={{ display: "inline", marginRight: "var(--dp-space-1)" }} />
            {store.error}
          </div>
        )}
      </div>

      {showReminder && store.currentCustomer && (
        <ReminderSet
          customerId={store.currentCustomer.id}
          onClose={() => setShowReminder(false)}
          onSaved={() => { setShowReminder(false); if (store.conversation) doMatch(store.conversation); }}
        />
      )}
    </div>
  );
};
