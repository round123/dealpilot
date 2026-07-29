/**
 * DealPilot 调度器 - 里程碑调度
 * 未完成里程碑到期前 3 天生成提醒
 */

import { eq, and, lte, gte, like } from "drizzle-orm";
import { db } from "../db/client";
import { milestones, projects, reminders } from "../db/schema";
import {
  MILESTONE_REMINDER_DAYS_BEFORE,
  REMINDER_CHECK_INTERVAL_MS,
} from "@dealpilot/shared";

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动里程碑调度器
 */
export function startMilestoneScheduler(): void {
  if (timer) return;
  timer = setInterval(checkMilestones, REMINDER_CHECK_INTERVAL_MS * 5); // 每 5 分钟检查一次
  // 启动时立即执行
  checkMilestones();
}

/**
 * 停止里程碑调度器
 */
export function stopMilestoneScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * 检查里程碑：
 * 未完成里程碑到期前 3 天自动生成提醒
 */
async function checkMilestones() {
  const threeDaysLater = new Date(Date.now() + MILESTONE_REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  // 查找未完成且到期前 3 天的里程碑
  const upcomingMilestones = await db
    .select({
      milestone: milestones,
      project: projects,
    })
    .from(milestones)
    .innerJoin(projects, eq(milestones.project_id, projects.id))
    .where(
      and(
        eq(milestones.completed, false),
        lte(milestones.date, threeDaysLater),
        gte(milestones.date, today),
      ),
    )
    .limit(100);

  const now = new Date().toISOString();

  for (const { milestone, project } of upcomingMilestones) {
    // 检查是否已为该里程碑生成过提醒
    const [existingReminder] = await db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.project_id, project.id),
          eq(reminders.type, "fixed_time"),
          like(reminders.resolution, `%milestone:${milestone.id}%`),
        ),
      )
      .limit(1);

    if (existingReminder) {
      continue;
    }

    // 生成提醒
    await db.insert(reminders).values({
      customer_id: project.customer_id,
      project_id: project.id,
      type: "fixed_time",
      status: "pending",
      due_at: milestone.date,
      priority: "normal",
      resolution: `milestone:${milestone.id}`,
      created_at: now,
      updated_at: now,
    });
  }
}
