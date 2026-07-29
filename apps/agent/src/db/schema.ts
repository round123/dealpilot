/**
 * DealPilot 数据库 Schema - Drizzle ORM (SQLite)
 *
 * 基于 Spec V1.0 §6 的 11 张表定义。
 * 技术栈锁定：drizzle-orm/sqlite-core
 *
 * SQLite 约束：
 * - 启用外键约束、WAL 模式、busy_timeout
 * - Agent 是唯一写入者，跨实体操作使用事务
 * - 主键 UUID 客户端生成，支持幂等重试
 * - 时间统一 UTC 存储，界面按本机时区展示
 * - 软删除保留 deleted_at，30 天后清理任务永久删除
 * - 手机号 E.164 标准化；邮箱忽略大小写；平台账号保存原值+标准化值
 */

import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============================================================
// customers - 客户主表
// ============================================================
export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    company: text("company"),
    country: text("country"),
    source: text("source"),
    grade: text("grade", { enum: ["A", "B", "C"] }).notNull(),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    deleted_at: text("deleted_at"),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    gradeIdx: index("idx_customers_grade").on(table.grade),
    statusIdx: index("idx_customers_status").on(table.status),
    deletedAtIdx: index("idx_customers_deleted_at").on(table.deleted_at),
  })
);

export const customersRelations = relations(customers, ({ many }) => ({
  contacts: many(contacts),
  social_accounts: many(social_accounts),
  projects: many(projects),
  follow_ups: many(follow_ups),
  reminders: many(reminders),
}));

// ============================================================
// contacts - 联系人
// ============================================================
export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    customer_id: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    customerIdIdx: index("idx_contacts_customer_id").on(table.customer_id),
    emailIdx: index("idx_contacts_email").on(table.email),
    phoneIdx: index("idx_contacts_phone").on(table.phone),
  })
);

export const contactsRelations = relations(contacts, ({ one }) => ({
  customer: one(customers, {
    fields: [contacts.customer_id],
    references: [customers.id],
  }),
}));

// ============================================================
// social_accounts - 社媒账号
// ============================================================
export const social_accounts = sqliteTable(
  "social_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    customer_id: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    contact_id: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    platform: text("platform").notNull(),
    raw_identifier: text("raw_identifier").notNull(),
    normalized_identifier: text("normalized_identifier").notNull(),
    manually_bound: integer("manually_bound", { mode: "boolean" }).notNull().default(false),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    platformNormalizedIdx: uniqueIndex("idx_social_accounts_platform_normalized").on(table.platform, table.normalized_identifier),
    customerIdIdx: index("idx_social_accounts_customer_id").on(table.customer_id),
  })
);

export const socialAccountsRelations = relations(social_accounts, ({ one }) => ({
  customer: one(customers, {
    fields: [social_accounts.customer_id],
    references: [customers.id],
  }),
  contact: one(contacts, {
    fields: [social_accounts.contact_id],
    references: [contacts.id],
  }),
}));

// ============================================================
// projects - 项目
// ============================================================
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    customer_id: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("USD"),
    amount: real("amount"),
    probability: integer("probability"),
    expected_close_date: text("expected_close_date"),
    stage: text("stage", {
      enum: ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost", "archived"],
    }).notNull(),
    grade: text("grade", { enum: ["S", "A", "B", "C"] }).notNull(),
    closed_reason: text("closed_reason"),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    customerIdIdx: index("idx_projects_customer_id").on(table.customer_id),
    stageIdx: index("idx_projects_stage").on(table.stage),
    gradeIdx: index("idx_projects_grade").on(table.grade),
  })
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  customer: one(customers, {
    fields: [projects.customer_id],
    references: [customers.id],
  }),
  follow_ups: many(follow_ups),
  reminders: many(reminders),
  risks: many(risks),
  milestones: many(milestones),
}));

// ============================================================
// follow_ups - 跟进记录
// ============================================================
export const follow_ups = sqliteTable(
  "follow_ups",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    customer_id: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    project_id: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: ["call", "email", "chat", "visit", "note", "message"],
    }).notNull(),
    note: text("note"),
    message_body: text("message_body"),
    message_direction: text("message_direction", {
      enum: ["inbound", "outbound"],
    }),
    occurred_at: text("occurred_at").notNull(),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    customerIdIdx: index("idx_follow_ups_customer_id").on(table.customer_id),
    projectIdIdx: index("idx_follow_ups_project_id").on(table.project_id),
    occurredAtIdx: index("idx_follow_ups_occurred_at").on(table.occurred_at),
  })
);

export const followUpsRelations = relations(follow_ups, ({ one }) => ({
  customer: one(customers, {
    fields: [follow_ups.customer_id],
    references: [customers.id],
  }),
  project: one(projects, {
    fields: [follow_ups.project_id],
    references: [projects.id],
  }),
}));

// ============================================================
// reminders - 提醒
// ============================================================
export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    customer_id: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    project_id: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    type: text("type", {
      enum: ["fixed_time", "waiting_reply", "paused"],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "completed", "snoozed", "ignored", "overdue", "replied"],
    }).notNull().default("pending"),
    due_at: text("due_at").notNull(),
    priority: text("priority", {
      enum: ["low", "normal", "high", "urgent"],
    }).notNull().default("normal"),
    last_notified_at: text("last_notified_at"),
    snooze_until: text("snooze_until"),
    resolution: text("resolution"),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    statusIdx: index("idx_reminders_status").on(table.status),
    dueAtIdx: index("idx_reminders_due_at").on(table.due_at),
    customerIdIdx: index("idx_reminders_customer_id").on(table.customer_id),
    projectIdIdx: index("idx_reminders_project_id").on(table.project_id),
    priorityIdx: index("idx_reminders_priority").on(table.priority),
  })
);

export const remindersRelations = relations(reminders, ({ one }) => ({
  customer: one(customers, {
    fields: [reminders.customer_id],
    references: [customers.id],
  }),
  project: one(projects, {
    fields: [reminders.project_id],
    references: [projects.id],
  }),
}));

// ============================================================
// risks - 项目风险
// ============================================================
export const risks = sqliteTable(
  "risks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    severity: text("severity", {
      enum: ["low", "medium", "high", "critical"],
    }).notNull(),
    status: text("status", {
      enum: ["open", "handling", "resolved", "ignored"],
    }).notNull().default("open"),
    handled_at: text("handled_at"),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    projectIdIdx: index("idx_risks_project_id").on(table.project_id),
    statusIdx: index("idx_risks_status").on(table.status),
    severityIdx: index("idx_risks_severity").on(table.severity),
  })
);

export const risksRelations = relations(risks, ({ one }) => ({
  project: one(projects, {
    fields: [risks.project_id],
    references: [projects.id],
  }),
}));

// ============================================================
// milestones - 项目里程碑
// ============================================================
export const milestones = sqliteTable(
  "milestones",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    date: text("date").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    projectIdIdx: index("idx_milestones_project_id").on(table.project_id),
    dateIdx: index("idx_milestones_date").on(table.date),
    completedIdx: index("idx_milestones_completed").on(table.completed),
  })
);

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, {
    fields: [milestones.project_id],
    references: [projects.id],
  }),
}));

// ============================================================
// import_jobs - 导入任务
// ============================================================
export const import_jobs = sqliteTable(
  "import_jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    file_name: text("file_name").notNull(),
    total_rows: integer("total_rows").notNull().default(0),
    valid_rows: integer("valid_rows").notNull().default(0),
    failed_rows: integer("failed_rows").notNull().default(0),
    duplicate_count: integer("duplicate_count").notNull().default(0),
    status: text("status", {
      enum: ["parsing", "previewing", "committed", "failed"],
    }).notNull().default("parsing"),
    created_at: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    statusIdx: index("idx_import_jobs_status").on(table.status),
    createdAtIdx: index("idx_import_jobs_created_at").on(table.created_at),
  })
);

// ============================================================
// local_events - 本地事件
// ============================================================
export const local_events = sqliteTable(
  "local_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    event_type: text("event_type").notNull(),
    entity_type: text("entity_type"),
    entity_id: text("entity_id"),
    metadata: text("metadata"),
    occurred_at: text("occurred_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    eventTypeIdx: index("idx_local_events_event_type").on(table.event_type),
    occurredAtIdx: index("idx_local_events_occurred_at").on(table.occurred_at),
  })
);

// ============================================================
// settings - 本地设置（单行，id=1）
// ============================================================
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().default(1),
  last_backup_at: text("last_backup_at"),
  auto_start: integer("auto_start", { mode: "boolean" }).notNull().default(false),
  minimize_to_tray: integer("minimize_to_tray", { mode: "boolean" }).notNull().default(true),
  backup_reminder_days: integer("backup_reminder_days"),
  locale: text("locale").notNull().default("zh-CN"),
  theme: text("theme").notNull().default("light"),
});

// ============================================================
// 导出全部表定义
// ============================================================
export const schema = {
  customers,
  contacts,
  social_accounts,
  projects,
  follow_ups,
  reminders,
  risks,
  milestones,
  import_jobs,
  local_events,
  settings,
};
