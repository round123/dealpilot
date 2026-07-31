import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { ReminderStatus } from "@dealpilot/shared";
import type { ReminderCreate, ReminderListQuery } from "@dealpilot/shared";
import { db } from "../db/client";
import { customers, projects, reminders } from "../db/schema";

type ReminderUpdates = Partial<typeof reminders.$inferInsert>;
export const NO_REEVALUATION_DUE_AT = "9999-12-31T23:59:59.999Z";

export async function listReminderRecords(query: ReminderListQuery) {
  const conditions = [isNull(customers.deleted_at)];
  if (query.status) conditions.push(eq(reminders.status, query.status));

  const sortColumn = query.sort_by === "priority" ? reminders.priority
    : query.sort_by === "created_at" ? reminders.created_at
    : reminders.due_at;
  if (query.cursor) {
    const [cursor] = await db.select().from(reminders)
      .where(eq(reminders.id, query.cursor)).limit(1);
    if (cursor) {
      const cursorValue = query.sort_by === "priority" ? cursor.priority
        : query.sort_by === "created_at" ? cursor.created_at
        : cursor.due_at;
      conditions.push(sql`(${sortColumn} > ${cursorValue} OR (${sortColumn} = ${cursorValue} AND ${reminders.id} > ${query.cursor}))`);
    }
  }

  return db.select({ reminder: reminders }).from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .where(and(...conditions))
    .orderBy(asc(sortColumn), asc(reminders.id))
    .limit(query.limit + 1);
}

export async function findReminder(reminderId: string) {
  const [reminder] = await db.select().from(reminders)
    .where(eq(reminders.id, reminderId)).limit(1);
  return reminder;
}

export async function findDuplicateReminder(input: ReminderCreate) {
  const effectiveDueAt = input.type === "paused"
    ? input.reevaluate_at ?? NO_REEVALUATION_DUE_AT
    : input.due_at!;
  const [existing] = await db.select({ id: reminders.id }).from(reminders)
    .where(and(
      eq(reminders.customer_id, input.customer_id),
      eq(reminders.type, input.type),
      eq(reminders.due_at, effectiveDueAt),
      eq(reminders.status, ReminderStatus.PENDING),
    )).limit(1);
  return existing;
}

export async function insertReminder(input: ReminderCreate) {
  const now = new Date().toISOString();
  const dueAt = input.type === "paused"
    ? input.reevaluate_at ?? NO_REEVALUATION_DUE_AT
    : input.due_at!;
  const [created] = await db.insert(reminders).values({
    customer_id: input.customer_id,
    project_id: input.project_id ?? null,
    type: input.type,
    status: ReminderStatus.PENDING,
    due_at: dueAt,
    priority: input.priority,
    pause_reason: input.pause_reason ?? null,
    reevaluate_at: input.reevaluate_at ?? null,
    created_at: now,
    updated_at: now,
  }).returning();
  return created;
}

export async function updateReminderRecord(
  reminderId: string,
  updates: ReminderUpdates,
  updatedAt = new Date().toISOString(),
) {
  const [updated] = await db.update(reminders)
    .set({ ...updates, updated_at: updatedAt })
    .where(eq(reminders.id, reminderId)).returning();
  return updated;
}

export function getPopupReminderCandidates(now: string) {
  return db.select({
    reminder: reminders,
    customerName: customers.name,
    projectName: projects.name,
    customerGrade: customers.grade,
    projectGrade: projects.grade,
    hasHighRisk: sql<number>`CASE WHEN ${reminders.project_id} IS NOT NULL AND EXISTS (
      SELECT 1 FROM risks
      WHERE risks.project_id = ${reminders.project_id}
        AND risks.severity IN ('high', 'critical')
        AND risks.status IN ('open', 'handling')
    ) THEN 1 ELSE 0 END`,
    conversationPlatform: sql<string | null>`(
      SELECT social_accounts.platform FROM social_accounts
      WHERE social_accounts.customer_id = ${reminders.customer_id}
        AND social_accounts.platform IN ('whatsapp', 'telegram')
      ORDER BY social_accounts.manually_bound DESC, social_accounts.created_at ASC
      LIMIT 1
    )`,
    conversationIdentifier: sql<string | null>`(
      SELECT social_accounts.raw_identifier FROM social_accounts
      WHERE social_accounts.customer_id = ${reminders.customer_id}
        AND social_accounts.platform IN ('whatsapp', 'telegram')
      ORDER BY social_accounts.manually_bound DESC, social_accounts.created_at ASC
      LIMIT 1
    )`,
  }).from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .leftJoin(projects, eq(reminders.project_id, projects.id))
    .where(and(
      isNull(customers.deleted_at),
      sql`${reminders.status} IN ('pending', 'overdue')`,
      sql`(${reminders.type} <> 'paused' OR (
        ${reminders.reevaluate_at} IS NOT NULL
        AND ${reminders.reevaluate_at} <= ${now}
      ))`,
    ));
}

export function findDueReminderDeliveries(now: string) {
  return db.select({ reminder: reminders, customerName: customers.name })
    .from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .where(and(
      isNull(customers.deleted_at),
      or(
        and(
          lte(reminders.due_at, now),
          or(
            eq(reminders.status, ReminderStatus.PENDING),
            and(eq(reminders.status, ReminderStatus.OVERDUE), isNull(reminders.last_notified_at)),
          ),
        ),
        and(
          eq(reminders.status, ReminderStatus.SNOOZED),
          lte(reminders.snooze_until, now),
        ),
      ),
    )).limit(100);
}

export function findUpcomingReminderDeliveries(now: string, windowEnd: string) {
  return db.select({ reminder: reminders, customerName: customers.name })
    .from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .where(and(
      isNull(customers.deleted_at),
      eq(reminders.status, ReminderStatus.PENDING),
      isNull(reminders.last_notified_at),
      gt(reminders.due_at, now),
      lte(reminders.due_at, windowEnd),
    )).limit(50);
}

export function markReminderOverdue(reminderId: string, notifiedAt: string | null) {
  return db.update(reminders).set({
    status: ReminderStatus.OVERDUE,
    ...(notifiedAt
      ? { last_notified_at: notifiedAt, delivered_at: notifiedAt }
      : {}),
    updated_at: new Date().toISOString(),
  }).where(and(
    eq(reminders.id, reminderId),
    sql`${reminders.status} IN ('pending', 'snoozed', 'overdue')`,
  ));
}

export function markReminderNotified(reminderId: string, notifiedAt: string) {
  return db.update(reminders).set({
    last_notified_at: notifiedAt,
    delivered_at: notifiedAt,
    updated_at: notifiedAt,
  }).where(and(eq(reminders.id, reminderId), isNull(reminders.last_notified_at)));
}
