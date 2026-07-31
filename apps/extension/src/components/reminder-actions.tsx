import React from "react";
import { Check, Clock3, EyeOff, Reply } from "lucide-react";
import type { ReminderAction } from "../lib/reminder-actions";

interface ReminderActionsProps {
  reminderType: string;
  busy: boolean;
  colorPrefix: "--color" | "--dp-color";
  error?: string | null;
  onAction: (action: ReminderAction) => void;
}

export const ReminderActions: React.FC<ReminderActionsProps> = ({
  reminderType,
  busy,
  colorPrefix,
  error,
  onAction,
}) => {
  const border = `var(${colorPrefix}-border-default)`;
  const text = `var(${colorPrefix}-text-secondary)`;
  const background = `var(${colorPrefix}-bg-card)`;
  const errorColor = `var(${colorPrefix}-error)`;
  const actions: Array<{
    action: ReminderAction;
    label: string;
    title: string;
    icon: React.ReactNode;
  }> = [
    { action: "complete", label: "完成", title: "标记完成", icon: <Check size={12} /> },
    { action: "snooze", label: "稍后", title: "一天后再提醒", icon: <Clock3 size={12} /> },
    { action: "ignore", label: "忽略", title: "忽略此提醒", icon: <EyeOff size={12} /> },
  ];
  if (reminderType === "waiting_reply") {
    actions.push({
      action: "reply_received",
      label: "已收到回复",
      title: "确认已收到客户回复",
      icon: <Reply size={12} />,
    });
  }

  return (
    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
        {actions.map(({ action, label, title, icon }) => (
          <button
            key={action}
            type="button"
            title={title}
            disabled={busy}
            onClick={() => onAction(action)}
            style={{
              minHeight: "26px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              padding: "3px 7px",
              border: `1px solid ${border}`,
              borderRadius: "4px",
              background,
              color: text,
              fontSize: "11px",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" style={{ marginTop: "5px", fontSize: "10px", color: errorColor }}>
          {error}，可再次点击操作重试
        </div>
      )}
    </div>
  );
};
