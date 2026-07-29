/**
 * DealPilot 路由 - Stats
 * GET /stats
 */

import { Hono } from "hono";
import { eq, and, isNull, sql, count } from "drizzle-orm";
import { db } from "../db/client";
import {
  customers,
  follow_ups,
  reminders,
  projects,
} from "../db/schema";

const app = new Hono();

// GET /stats - 本地使用指标
app.get("/stats", async (c) => {
  const [totalCustomers] = await db
    .select({ count: count() })
    .from(customers)
    .where(isNull(customers.deleted_at));

  const [totalFollowUps] = await db
    .select({ count: count() })
    .from(follow_ups);

  const [totalReminders] = await db
    .select({ count: count() })
    .from(reminders);

  const [pendingReminders] = await db
    .select({ count: count() })
    .from(reminders)
    .where(eq(reminders.status, "pending"));

  const [overdueReminders] = await db
    .select({ count: count() })
    .from(reminders)
    .where(
      and(
        eq(reminders.status, "overdue"),
        sql`${reminders.due_at} < datetime('now')`,
      ),
    );

  const [totalProjects] = await db
    .select({ count: count() })
    .from(projects);

  const [activeProjects] = await db
    .select({ count: count() })
    .from(projects)
    .where(
      sql`${projects.stage} NOT IN ('closed_won', 'closed_lost', 'archived')`,
    );

  const [completedReminders] = await db
    .select({ count: count() })
    .from(reminders)
    .where(eq(reminders.status, "completed"));

  const totalRemindersCount = totalReminders.count;
  const completionRate = totalRemindersCount > 0
    ? completedReminders.count / totalRemindersCount
    : 0;

  return c.json({
    total_customers: totalCustomers.count,
    total_followups: totalFollowUps.count,
    total_reminders: totalReminders.count,
    pending_reminders: pendingReminders.count,
    overdue_reminders: overdueReminders.count,
    total_projects: totalProjects.count,
    active_projects: activeProjects.count,
    completion_rate: Math.round(completionRate * 100) / 100,
  });
});

export default app;
