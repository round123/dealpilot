import { getStatsRecord } from "../repositories/system-repository";

export async function getStats() {
  const stats = await getStatsRecord();
  const completionRate = stats.totalReminders > 0
    ? stats.completedReminders / stats.totalReminders
    : 0;
  return {
    total_customers: stats.totalCustomers,
    total_followups: stats.totalFollowUps,
    total_reminders: stats.totalReminders,
    pending_reminders: stats.pendingReminders,
    overdue_reminders: stats.overdueReminders,
    total_projects: stats.totalProjects,
    active_projects: stats.activeProjects,
    completion_rate: Math.round(completionRate * 100) / 100,
  };
}
