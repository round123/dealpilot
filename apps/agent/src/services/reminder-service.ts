/**
 * DealPilot 提醒服务
 * 状态流转、去重
 */

import { eq, and, sql, asc, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { reminders, customers, projects } from "../db/schema";
import { ApiError } from "../middleware/error-handler";
import {
  ReminderStatus,
  ReminderPriority,
  POPUP_REMINDER_LIMIT,
  OVERDUE_ESCALATION_DAYS,
} from "@dealpilot/shared";
import type { ReminderStatusUpdate } from "@dealpilot/shared";

/**
 * 更新提醒状态
 */
export async function updateReminderStatus(
  reminderId: string,
  update: ReminderStatusUpdate,
) {
  const now = new Date().toISOString();

  const [existing] = await db
    .select()
    .from(reminders)
    .where(eq(reminders.id, reminderId))
    .limit(1);

  if (!existing) {
    throw ApiError.notFound("Reminder not found");
  }

  const updates: Record<string, unknown> = {
    status: update.status,
    updated_at: now,
  };

  if (update.status === ReminderStatus.SNOOZED && update.snooze_until) {
    updates.snooze_until = update.snooze_until;
  }

  if (update.resolution) {
    updates.resolution = update.resolution;
  }

  if (
    update.status === ReminderStatus.COMPLETED ||
    update.status === ReminderStatus.IGNORED ||
    update.status === ReminderStatus.REPLIED
  ) {
    updates.resolution = update.resolution ?? null;
  }

  const [updated] = await db
    .update(reminders)
    .set(updates)
    .where(eq(reminders.id, reminderId))
    .returning();

  return updated;
}

/**
 * 获取 popup 前 5 条待办
 * 按逾期/高风险/分级/到期时间排序
 */
export async function getPopupReminders() {
  // 获取 pending 和 overdue 状态的提醒
  const pendingReminders = await db
    .select({
      reminder: reminders,
      customer: customers,
    })
    .from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .where(
      and(
        isNull(customers.deleted_at),
        sql`${reminders.status} IN ('pending', 'overdue')`,
      ),
    )
    .orderBy(asc(reminders.due_at));

  // 排序权重计算
  const now = Date.now();
  const sorted = pendingReminders.sort((a, b) => {
    const ra = a.reminder;
    const rb = b.reminder;

    // 逾期优先
    const aOverdue = new Date(ra.due_at).getTime() < now ? 1 : 0;
    const bOverdue = new Date(rb.due_at).getTime() < now ? 1 : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;

    // 高风险优先
    const priorityOrder: Record<string, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    };
    const aPriority = priorityOrder[ra.priority] ?? 2;
    const bPriority = priorityOrder[rb.priority] ?? 2;
    if (aPriority !== bPriority) return bPriority - aPriority;

    // 客户分级排序（A > B > C）
    const gradeOrder: Record<string, number> = { A: 3, B: 2, C: 1 };
    const aGrade = gradeOrder[a.customer.grade] ?? 0;
    const bGrade = gradeOrder[b.customer.grade] ?? 0;
    if (aGrade !== bGrade) return bGrade - aGrade;

    // 到期时间升序
    return new Date(ra.due_at).getTime() - new Date(rb.due_at).getTime();
  });

  return sorted.slice(0, POPUP_REMINDER_LIMIT).map((r) => r.reminder);
}

/**
 * 提醒去重：同一客户同一类型同一到期时间的 pending 提醒不重复创建
 */
export async function checkDuplicateReminder(
  customerId: string,
  type: string,
  dueAt: string,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.customer_id, customerId),
        eq(reminders.type, type),
        eq(reminders.due_at, dueAt),
        eq(reminders.status, ReminderStatus.PENDING),
      ),
    )
    .limit(1);

  return !!existing;
}
