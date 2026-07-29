/**
 * DealPilot 调度器 - 提醒调度
 * 扫描到期提醒、补发、标记逾期
 */

import { eq, and, lte, gt, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { reminders, customers, projects } from "../db/schema";
import {
  REMINDER_CHECK_INTERVAL_MS,
  ReminderStatus,
} from "@dealpilot/shared";
import { notify } from "../platform/notifier";

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动提醒调度器
 */
export function startReminderScheduler(): void {
  if (timer) return;
  timer = setInterval(checkReminders, REMINDER_CHECK_INTERVAL_MS);
  // 启动时立即执行一次
  checkReminders();
}

/**
 * 停止提醒调度器
 */
export function stopReminderScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * 检查提醒：
 * 1. 扫描已到期未处理提醒 -> 补发通知 + 标记逾期
 * 2. 扫描到期前 5 分钟 pending 提醒 -> 发送通知
 */
async function checkReminders() {
  const now = new Date().toISOString();

  // 1. 标记逾期提醒（pending 且 due_at < now）
  const duePendingReminders = await db
    .select({
      reminder: reminders,
      customer: customers,
    })
    .from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .where(
      and(
        eq(reminders.status, ReminderStatus.PENDING),
        lte(reminders.due_at, now),
        isNull(customers.deleted_at),
      ),
    )
    .limit(100);

  for (const { reminder, customer } of duePendingReminders) {
    // 发送系统通知
    try {
      await notify({
        title: "DealPilot 提醒",
        message: `${customer.name} - 提醒已到期`,
        sound: true,
      });
    } catch (err) {
      console.error("[reminder-scheduler] Notification failed:", err);
    }

    // 更新状态为逾期（只更新未通知过的）
    await db
      .update(reminders)
      .set({
        status: ReminderStatus.OVERDUE,
        last_notified_at: now,
        updated_at: now,
      })
      .where(eq(reminders.id, reminder.id));
  }

  // 2. 扫描即将到期（5 分钟内）的 pending 提醒，发送预通知
  const fiveMinutesLater = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const upcomingReminders = await db
    .select({
      reminder: reminders,
      customer: customers,
    })
    .from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .where(
      and(
        eq(reminders.status, ReminderStatus.PENDING),
        lte(reminders.due_at, fiveMinutesLater),
        gt(reminders.due_at, now),
        isNull(customers.deleted_at),
      ),
    )
    .limit(50);

  for (const { reminder, customer } of upcomingReminders) {
    // 只在未通知过的情况下发送
    if (!reminder.last_notified_at) {
      try {
        await notify({
          title: "DealPilot 提醒",
          message: `${customer.name} - 提醒即将到期`,
          sound: true,
        });
      } catch (err) {
        console.error("[reminder-scheduler] Notification failed:", err);
      }

      await db
        .update(reminders)
        .set({
          last_notified_at: now,
          updated_at: now,
        })
        .where(eq(reminders.id, reminder.id));
    }
  }
}
