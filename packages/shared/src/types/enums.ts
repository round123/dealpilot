/**
 * DealPilot 共享枚举常量
 * 前后端共用，确保枚举值一致
 */

export const CustomerGrade = {
  A: "A",
  B: "B",
  C: "C",
} as const;

export const CustomerStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export const ProjectStage = {
  LEAD: "lead",
  QUALIFIED: "qualified",
  PROPOSAL: "proposal",
  NEGOTIATION: "negotiation",
  CLOSED_WON: "closed_won",
  CLOSED_LOST: "closed_lost",
  ARCHIVED: "archived",
} as const;

export const ProjectGrade = {
  S: "S",
  A: "A",
  B: "B",
  C: "C",
} as const;

export const FollowUpType = {
  CALL: "call",
  EMAIL: "email",
  CHAT: "chat",
  VISIT: "visit",
  NOTE: "note",
  MESSAGE: "message",
} as const;

export const MessageDirection = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
} as const;

export const ReminderType = {
  FIXED_TIME: "fixed_time",
  WAITING_REPLY: "waiting_reply",
  PAUSED: "paused",
} as const;

export const ReminderStatus = {
  PENDING: "pending",
  COMPLETED: "completed",
  SNOOZED: "snoozed",
  IGNORED: "ignored",
  OVERDUE: "overdue",
  REPLIED: "replied",
} as const;

export const ReminderPriority = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export const RiskSeverity = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;

export const RiskStatus = {
  OPEN: "open",
  HANDLING: "handling",
  RESOLVED: "resolved",
  IGNORED: "ignored",
} as const;

export const ImportJobStatus = {
  PARSING: "parsing",
  PREVIEWING: "previewing",
  COMMITTED: "committed",
  FAILED: "failed",
} as const;

export const Platform = {
  WHATSAPP: "whatsapp",
  TELEGRAM: "telegram",
} as const;

export const MatchStatus = {
  UNIQUE: "unique",
  MULTIPLE: "multiple",
  NONE: "none",
} as const;

export const MatchMethod = {
  MANUAL: "manual",
  PHONE: "phone",
  PLATFORM: "platform",
} as const;
