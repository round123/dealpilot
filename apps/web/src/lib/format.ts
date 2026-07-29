export {
  formatAmount,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  isOverdue,
} from "@dealpilot/shared";

import type { ProjectStage } from "@dealpilot/shared";

const STAGE_LABELS: Record<string, string> = {
  lead: "需求确认",
  qualified: "方案/样品",
  proposal: "报价",
  negotiation: "谈判",
  closed_won: "成交",
  closed_lost: "失单",
  archived: "已归档",
};

const STAGE_COLORS: Record<string, string> = {
  lead: "var(--color-stage-need)",
  qualified: "var(--color-stage-sample)",
  proposal: "var(--color-stage-quote)",
  negotiation: "var(--color-stage-negotiate)",
  closed_won: "var(--color-stage-won)",
  closed_lost: "var(--color-stage-lost)",
  archived: "var(--color-gray-400)",
};

const FOLLOWUP_TYPE_LABELS: Record<string, string> = {
  call: "通话",
  email: "邮件",
  chat: "会话标记",
  visit: "拜访",
  note: "备注",
  message: "消息",
};

const REMINDER_TYPE_LABELS: Record<string, string> = {
  fixed_time: "固定时间",
  waiting_reply: "等待回复",
  paused: "暂不跟进",
};

const REMINDER_STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  completed: "已完成",
  snoozed: "已稍后",
  ignored: "已忽略",
  overdue: "已逾期",
  replied: "已回复",
};

const RISK_SEVERITY_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "严重",
};

const RISK_STATUS_LABELS: Record<string, string> = {
  open: "未处理",
  handling: "处理中",
  resolved: "已解决",
  ignored: "已忽略",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function stageColor(stage: string): string {
  return STAGE_COLORS[stage] ?? "var(--color-gray-400)";
}

export function followUpTypeLabel(type: string): string {
  return FOLLOWUP_TYPE_LABELS[type] ?? type;
}

export function reminderTypeLabel(type: string): string {
  return REMINDER_TYPE_LABELS[type] ?? type;
}

export function reminderStatusLabel(status: string): string {
  return REMINDER_STATUS_LABELS[status] ?? status;
}

export function riskSeverityLabel(severity: string): string {
  return RISK_SEVERITY_LABELS[severity] ?? severity;
}

export function riskStatusLabel(status: string): string {
  return RISK_STATUS_LABELS[status] ?? status;
}

export { STAGE_LABELS };
export type { ProjectStage };
