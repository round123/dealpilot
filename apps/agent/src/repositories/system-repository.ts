import { and, count, eq, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import type { SettingsUpdate } from "@dealpilot/shared";
import { db } from "../db/client";
import {
  contacts,
  customers,
  follow_ups,
  import_jobs,
  local_events,
  milestones,
  projects,
  reminders,
  risks,
  settings,
  social_accounts,
} from "../db/schema";

export async function getOrCreateSettings() {
  const [current] = await db.select().from(settings)
    .where(eq(settings.id, 1)).limit(1);
  if (current?.backup_reminder_days != null) return current;
  if (current) {
    const [updated] = await db.update(settings)
      .set({ backup_reminder_days: 7 })
      .where(eq(settings.id, 1))
      .returning();
    return updated;
  }
  const [created] = await db.insert(settings)
    .values({ id: 1, backup_reminder_days: 7 })
    .returning();
  return created;
}

export async function getLocalDataState() {
  const currentSettings = await getOrCreateSettings();
  const [[business], [committedImports]] = await Promise.all([
    db.select({
      count: count(),
      oldestCreatedAt: sql<string | null>`min(${customers.created_at})`,
    }).from(customers),
    db.select({ count: count() }).from(import_jobs)
      .where(eq(import_jobs.status, "committed")),
  ]);
  return {
    settings: currentSettings,
    businessCount: business.count,
    oldestCreatedAt: business.oldestCreatedAt,
    committedImportCount: committedImports.count,
  };
}

export async function updateSettingsRecord(input: SettingsUpdate) {
  await getOrCreateSettings();
  const [updated] = await db.update(settings).set(input)
    .where(eq(settings.id, 1)).returning();
  return updated;
}

export async function markBackupCreated(createdAt: string) {
  await getOrCreateSettings();
  await db.update(settings).set({ last_backup_at: createdAt })
    .where(eq(settings.id, 1));
}

export async function getStatsRecord() {
  const [
    [totalCustomers],
    [totalFollowUps],
    [totalReminders],
    [pendingReminders],
    [overdueReminders],
    [totalProjects],
    [activeProjects],
    [completedReminders],
  ] = await Promise.all([
    db.select({ count: count() }).from(customers).where(isNull(customers.deleted_at)),
    db.select({ count: count() }).from(follow_ups),
    db.select({ count: count() }).from(reminders),
    db.select({ count: count() }).from(reminders).where(eq(reminders.status, "pending")),
    db.select({ count: count() }).from(reminders).where(and(
      eq(reminders.status, "overdue"),
      sql`${reminders.due_at} < datetime('now')`,
    )),
    db.select({ count: count() }).from(projects),
    db.select({ count: count() }).from(projects)
      .where(sql`${projects.stage} NOT IN ('closed_won', 'closed_lost', 'archived')`),
    db.select({ count: count() }).from(reminders).where(eq(reminders.status, "completed")),
  ]);
  return {
    totalCustomers: totalCustomers.count,
    totalFollowUps: totalFollowUps.count,
    totalReminders: totalReminders.count,
    pendingReminders: pendingReminders.count,
    overdueReminders: overdueReminders.count,
    totalProjects: totalProjects.count,
    activeProjects: activeProjects.count,
    completedReminders: completedReminders.count,
  };
}

export function listCustomersForExport(filters?: {
  search?: string;
  grade?: "A" | "B" | "C";
  status?: "active" | "inactive";
}) {
  const conditions = [isNull(customers.deleted_at)];
  if (filters?.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(or(like(customers.name, pattern), like(customers.company, pattern))!);
  }
  if (filters?.grade) conditions.push(eq(customers.grade, filters.grade));
  if (filters?.status) conditions.push(eq(customers.status, filters.status));
  return db.select().from(customers).where(and(...conditions));
}

export async function getAllBusinessDataForExport() {
  const [
    customerRows,
    contactRows,
    socialAccountRows,
    projectRows,
    followUpRows,
    reminderRows,
    riskRows,
    milestoneRows,
  ] = await Promise.all([
    db.select().from(customers),
    db.select().from(contacts),
    db.select().from(social_accounts),
    db.select().from(projects),
    db.select().from(follow_ups),
    db.select().from(reminders),
    db.select().from(risks),
    db.select().from(milestones),
  ]);

  return {
    customers: customerRows,
    contacts: contactRows,
    socialAccounts: socialAccountRows,
    projects: projectRows,
    followUps: followUpRows,
    reminders: reminderRows,
    risks: riskRows,
    milestones: milestoneRows,
  };
}

export async function deleteExpiredCustomers(cutoffDate: string) {
  const expired = await db.select({ id: customers.id }).from(customers).where(and(
    isNotNull(customers.deleted_at),
    lte(customers.deleted_at, cutoffDate),
  ));
  if (expired.length === 0) return 0;
  await db.transaction(async (tx) => {
    for (const { id } of expired) {
      await tx.delete(customers).where(eq(customers.id, id));
    }
  });
  return expired.length;
}
