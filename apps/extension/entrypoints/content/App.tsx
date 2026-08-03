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

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ChevronDown, Compass, AlertCircle, Clock, Bell, Link, Unlink } from "lucide-react";
import { useExtensionStore } from "../../src/stores/extension-store";
import {
  bindMatch,
  extensionErrorMessage,
  fetchFollowUps,
  fetchRemindersByCustomer,
  openContentWorkbench,
  resolveMatch,
  searchCustomers,
  unbindMatch,
  updateContentReminderStatus,
} from "../../src/lib/content-cloud-client";
import { onConversationChange, type ConversationInfo } from "../../src/lib/platform-detect";
import { CustomerCard } from "./components/customer-card";
import { FollowUpMarker } from "./components/follow-up-marker";
import { ReminderSet } from "./components/reminder-set";
import { CustomerSearchPanel, LoadingState, UnsupportedState, NoMatchState, MultipleMatchState } from "./components/match-states";
import type { Customer, FollowUp, Reminder } from "@dealpilot/shared";
import { isOverdue, formatRelativeTime } from "@dealpilot/shared";
import { ReminderActions } from "../../src/components/reminder-actions";
import {
  createReminderActionAttemptStore,
  type ReminderAction,
} from "../../src/lib/reminder-actions";
import { AutomaticMatchConfirmation } from "../../src/components/match-confirmation";
import { shouldAutoCollapseFloatPanel } from "../../src/lib/float-panel-layout";

/** 提醒类型图标 */
const REMINDER_ICON = <Clock size={12} />;

/** 状态 Tag 颜色 */
const STATUS_COLORS: Record<string, string> = {
  pending: "var(--dp-color-info)", overdue: "var(--dp-color-error)",
  snoozed: "var(--dp-color-warning)", completed: "var(--dp-color-success)",
  ignored: "var(--dp-color-gray-400)", replied: "var(--dp-color-info)",
};

/** 未完成提醒列表 */
const ReminderList: React.FC<{
  reminders: Reminder[];
  busyReminderId: string | null;
  actionError: { id: string; message: string } | null;
  onAction: (reminder: Reminder, action: ReminderAction) => void;
}> = ({ reminders, busyReminderId, actionError, onAction }) => (
  <div style={{ padding: "var(--dp-space-3)", borderTop: "1px solid var(--dp-color-border-default)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-1)", marginBottom: "var(--dp-space-2)" }}>
      <Bell size={14} style={{ color: "var(--dp-color-warning)" }} />
      <span style={{ fontSize: "13px", fontWeight: 500 }}>未完成提醒 {reminders.length}</span>
    </div>
    {reminders.map((r) => {
      const overdue = isOverdue(r.due_at);
      const color = overdue ? "var(--dp-color-error)" : STATUS_COLORS[r.status] ?? "var(--dp-color-info)";
      return (
        <div key={r.id} style={{ padding: "var(--dp-space-1) 0", fontSize: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-2)" }}>
            {REMINDER_ICON}
            <span style={{ color: "var(--dp-color-text-secondary)" }}>{formatRelativeTime(r.due_at)}</span>
            <span style={{ marginLeft: "auto", padding: "2px 6px", borderRadius: "var(--dp-radius-full)", backgroundColor: color, color: "var(--dp-color-text-inverse)", fontSize: "10px" }}>
              {overdue ? "逾期" : r.status}
            </span>
          </div>
          <ReminderActions
            reminderType={r.type}
            busy={busyReminderId === r.id}
            colorPrefix="--dp-color"
            error={actionError?.id === r.id ? actionError.message : null}
            onAction={(action) => onAction(r, action)}
          />
        </div>
      );
    })}
  </div>
);

/** 唯一命中内容 */
export const UniqueMatchContent: React.FC<{
  customer: { id: string; name: string; company: string | null; country: string | null; source: string | null; grade: string };
  followUps: FollowUp[];
  reminders: Reminder[];
  onSetReminder: () => void;
  automaticMatch: boolean;
  onConfirmMatch: () => void;
  showRebind: boolean;
  onToggleRebind: () => void;
  onUnbind: () => void;
  bindingBusy: boolean;
  searchPanel: React.ReactNode;
  busyReminderId: string | null;
  actionError: { id: string; message: string } | null;
  onReminderAction: (reminder: Reminder, action: ReminderAction) => void;
}> = ({ customer, followUps, reminders, onSetReminder, automaticMatch, onConfirmMatch, showRebind, onToggleRebind, onUnbind, bindingBusy, searchPanel, busyReminderId, actionError, onReminderAction }) => {
  const lastFu = followUps[0];
  return (
    <div>
      <CustomerCard
        customer={customer as any}
        lastFollowUpAt={lastFu?.occurred_at ?? null}
        lastFollowUpNote={lastFu?.note ?? lastFu?.message_body ?? null}
        onOpen={() => void openContentWorkbench({ customerId: customer.id })}
      />
      {reminders.length > 0 && (
        <ReminderList
          reminders={reminders}
          busyReminderId={busyReminderId}
          actionError={actionError}
          onAction={onReminderAction}
        />
      )}
      <div style={{ padding: "var(--dp-space-2) var(--dp-space-3)", borderTop: "1px solid var(--dp-color-border-default)" }}>
        {automaticMatch && (
          <AutomaticMatchConfirmation
            automaticMatch
            bindingBusy={bindingBusy}
            onConfirm={onConfirmMatch}
          />
        )}
        <div style={{ display: "flex", gap: "var(--dp-space-2)" }}>
          <button
            type="button"
            onClick={onToggleRebind}
            disabled={bindingBusy}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--dp-space-1)", padding: "var(--dp-space-1) var(--dp-space-2)", border: "1px solid var(--dp-color-border-default)", borderRadius: "var(--dp-radius-md)", background: "var(--dp-color-bg-card)", cursor: "pointer", fontSize: "12px" }}
          >
            <Link size={13} />改绑
          </button>
          <button
            type="button"
            onClick={onUnbind}
            disabled={bindingBusy}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--dp-space-1)", padding: "var(--dp-space-1) var(--dp-space-2)", border: "1px solid var(--dp-color-border-default)", borderRadius: "var(--dp-radius-md)", background: "var(--dp-color-bg-card)", cursor: "pointer", fontSize: "12px", color: "var(--dp-color-error)" }}
          >
            <Unlink size={13} />解绑
          </button>
        </div>
        {showRebind && <div style={{ marginTop: "var(--dp-space-2)" }}>{searchPanel}</div>}
      </div>
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
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [showRebind, setShowRebind] = useState(false);
  const [busyReminderId, setBusyReminderId] = useState<string | null>(null);
  const [reminderActionError, setReminderActionError] = useState<{ id: string; message: string } | null>(null);
  const reminderActionAttempts = useRef(createReminderActionAttemptStore());
  const matchRequestId = useRef(0);

  useEffect(() => {
    const collapseForNarrowConversation = () => {
      if (shouldAutoCollapseFloatPanel(window.innerWidth)) {
        useExtensionStore.getState().setExpanded(false);
      }
    };
    collapseForNarrowConversation();
    window.addEventListener("resize", collapseForNarrowConversation);
    return () =>
      window.removeEventListener("resize", collapseForNarrowConversation);
  }, []);

  const doMatch = useCallback(async (conv: ConversationInfo) => {
    const requestId = ++matchRequestId.current;
    const actions = useExtensionStore.getState();
    if (!conv.isOneOnOne) { actions.setMatchState("unsupported"); return; }
    actions.setMatchLoading();
    try {
      const result = await resolveMatch({ platform: conv.platform, raw_identifier: conv.rawIdentifier });
      if (requestId !== matchRequestId.current) return;
      actions.setMatchResult(result);
      if (result.status === "unique" && result.customer) {
        setShowRebind(false);
        setBindSearch("");
        setSearchResults([]);
        const [fu, rm] = await Promise.all([
          fetchFollowUps(result.customer.id, 1),
          fetchRemindersByCustomer(result.customer.id),
        ]);
        if (requestId !== matchRequestId.current) return;
        setFollowUps(fu.items);
        setReminders(rm.items.filter((r) => r.status !== "completed" && r.status !== "ignored"));
      }
    } catch (err) {
      if (requestId === matchRequestId.current) {
        actions.setError(extensionErrorMessage(err, "客户匹配失败，请重试"));
      }
    }
  }, []);

  useEffect(() => {
    const query = bindSearch.trim();
    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      setBindingError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setBindingError(null);
      void searchCustomers(query, controller.signal)
        .then((page) => setSearchResults(page.items))
        .catch((error) => {
          if (!controller.signal.aborted) {
            setSearchResults([]);
            setBindingError(extensionErrorMessage(error, "客户搜索失败，请重试"));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bindSearch]);

  useEffect(() => {
    const unsub = onConversationChange((conv) => {
      const actions = useExtensionStore.getState();
      actions.setConversation(conv);
      if (conv) doMatch(conv);
      else {
        matchRequestId.current++;
        actions.setMatchState("unsupported");
      }
    });
    return unsub;
  }, [doMatch]);

  const handleBind = async (customerId: string) => {
    const conversation = store.conversation;
    if (!conversation) return;
    setBindLoading(true);
    setBindingError(null);
    try {
      await bindMatch({
        platform: conversation.platform,
        raw_identifier: conversation.rawIdentifier,
        customer_id: customerId,
      });
      const current = useExtensionStore.getState().conversation;
      if (current?.platform === conversation.platform
        && current.normalizedIdentifier === conversation.normalizedIdentifier) {
        await doMatch(current);
      }
    } catch (err) {
      setBindingError(extensionErrorMessage(err, "客户绑定失败，请重试"));
    } finally {
      setBindLoading(false);
    }
  };

  const handleUnbind = async () => {
    const conversation = store.conversation;
    if (!conversation) return;
    setBindLoading(true);
    setBindingError(null);
    try {
      await unbindMatch({
        platform: conversation.platform,
        raw_identifier: conversation.rawIdentifier,
      });
      const current = useExtensionStore.getState().conversation;
      if (current?.platform === conversation.platform
        && current.normalizedIdentifier === conversation.normalizedIdentifier) {
        await doMatch(current);
      }
    } catch (error) {
      setBindingError(extensionErrorMessage(error, "客户解绑失败，请重试"));
    } finally {
      setBindLoading(false);
    }
  };

  const handleReminderAction = async (
    reminder: Reminder,
    action: ReminderAction,
  ) => {
    if (busyReminderId) return;
    const attempt = reminderActionAttempts.current.get(reminder.id, action);
    const snapshot = reminders;
    setBusyReminderId(reminder.id);
    setReminderActionError(null);
    setReminders((current) => current.filter((item) => item.id !== reminder.id));

    try {
      await updateContentReminderStatus(
        reminder.id,
        attempt.update,
        attempt.idempotencyKey,
      );
      reminderActionAttempts.current.complete(reminder.id, action);
    } catch (error) {
      setReminders(snapshot);
      setReminderActionError({
        id: reminder.id,
        message: extensionErrorMessage(error, "提醒处理失败"),
      });
    } finally {
      const customerId = useExtensionStore.getState().currentCustomer?.id;
      if (customerId) {
        try {
          const page = await fetchRemindersByCustomer(customerId);
          setReminders(page.items.filter((item) => item.status !== "completed" && item.status !== "ignored"));
        } catch {
          // Keep the optimistic result or exact rollback when reconciliation is unavailable.
        }
      }
      setBusyReminderId(null);
    }
  };

  const searchPanel = (
    <CustomerSearchPanel
      query={bindSearch}
      setQuery={setBindSearch}
      results={searchResults}
      searchLoading={searchLoading}
      bindLoading={bindLoading}
      onSelect={handleBind}
    />
  );

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
          <button
            onClick={() => void openContentWorkbench("home")}
            title="打开工作台"
            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "flex" }}
          >
            <Compass size={16} style={{ color: "var(--dp-color-primary)" }} />
          </button>
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
          <NoMatchState
            conversation={store.conversation}
            onSelect={handleBind}
            bindSearch={bindSearch}
            setBindSearch={setBindSearch}
            searchResults={searchResults}
            searchLoading={searchLoading}
            bindLoading={bindLoading}
            onCreate={() => void openContentWorkbench("new-customer")}
          />
        )}
        {store.matchState === "multiple" && (
          <MultipleMatchState candidates={store.candidates} onSelect={handleBind} bindLoading={bindLoading} />
        )}
        {store.matchState === "unique" && store.currentCustomer && (
          <UniqueMatchContent
            customer={store.currentCustomer}
            followUps={followUps}
            reminders={reminders}
            onSetReminder={() => setShowReminder(true)}
            automaticMatch={store.matchMethod === "phone" || store.matchMethod === "platform"}
            onConfirmMatch={() => {
              const customer = store.currentCustomer;
              if (customer) void handleBind(customer.id);
            }}
            showRebind={showRebind}
            onToggleRebind={() => setShowRebind((value) => !value)}
            onUnbind={() => void handleUnbind()}
            bindingBusy={bindLoading}
            searchPanel={searchPanel}
            busyReminderId={busyReminderId}
            actionError={reminderActionError}
            onReminderAction={(reminder, action) => void handleReminderAction(reminder, action)}
          />
        )}
        {bindingError && (
          <div style={{ padding: "var(--dp-space-2) var(--dp-space-3)", fontSize: "12px", color: "var(--dp-color-error)" }}>
            {bindingError}
          </div>
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
