import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { ReminderStatus } from "@dealpilot/shared";
import type { ReminderCreate, ReminderListQuery } from "@dealpilot/shared";
import { db } from "../db/client";
import { customers, projects, reminders } from "../db/schema";

type ReminderUpdates = Partial<typeof reminders.$inferInsert>;

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
  const [existing] = await db.select({ id: reminders.id }).from(reminders)
    .where(and(
      eq(reminders.customer_id, input.customer_id),
      eq(reminders.type, input.type),
      eq(reminders.due_at, input.due_at),
      eq(reminders.status, ReminderStatus.PENDING),
    )).limit(1);
  return existing;
}

export async function insertReminder(input: ReminderCreate) {
  const now = new Date().toISOString();
  const [created] = await db.insert(reminders).values({
    customer_id: input.customer_id,
    project_id: input.project_id ?? null,
    type: input.type,
    status: ReminderStatus.PENDING,
    due_at: input.due_at,
    priority: input.priority,
    created_at: now,
    updated_at: now,
  }).returning();
  return created;
}

export async function updateReminderRecord(reminderId: string, updates: ReminderUpdates) {
  const [updated] = await db.update(reminders)
    .set({ ...updates, updated_at: new Date().toISOString() })
    .where(eq(reminders.id, reminderId)).returning();
  return updated;
}

export function getPopupReminderCandidates() {
  return db.select({
    reminder: reminders,
    customerGrade: customers.grade,
    projectGrade: projects.grade,
  }).from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .leftJoin(projects, eq(reminders.project_id, projects.id))
    .where(and(
      isNull(customers.deleted_at),
      sql`${reminders.status} IN ('pending', 'overdue')`,
    ));
}

export function findDueReminderDeliveries(now: string) {
  return db.select({ reminder: reminders, customerName: customers.name })
    .from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .where(and(
      isNull(customers.deleted_at),
      lte(reminders.due_at, now),
      or(
        eq(reminders.status, ReminderStatus.PENDING),
        and(eq(reminders.status, ReminderStatus.OVERDUE), isNull(reminders.last_notified_at)),
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
    ...(notifiedAt ? { last_notified_at: notifiedAt } : {}),
    updated_at: new Date().toISOString(),
  }).where(and(
    eq(reminders.id, reminderId),
    sql`${reminders.status} IN ('pending', 'overdue')`,
  ));
}

export function markReminderNotified(reminderId: string, notifiedAt: string) {
  return db.update(reminders).set({
    last_notified_at: notifiedAt,
    updated_at: notifiedAt,
  }).where(and(eq(reminders.id, reminderId), isNull(reminders.last_notified_at)));
}
