import { getStatsRecord } from "../repositories/system-repository";
import { getRollingUsageMetricCounts } from "../repositories/metrics-repository";

export async function getStats(now: Date = new Date()) {
  const stats = await getStatsRecord();
  const rolling = getRollingUsageMetricCounts(now);
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
    rolling_30_days: {
      window_days: 30 as const,
      window_start: rolling.windowStart,
      window_end: rolling.windowEnd,
      on_time_completion: metric(
        rolling.onTimeCompleted,
        rolling.dueReminders,
        0.9,
        { minimum_sample: 20 },
      ),
      match_accuracy: metric(
        rolling.confirmedAutomaticMatches,
        rolling.evaluatedAutomaticMatches,
        0.95,
      ),
      reminder_handling: metric(
        rolling.handledReminders,
        rolling.deliveredReminders,
        0.9,
      ),
    },
  };
}

export async function getAnonymizedUsageMetricsReport(now: Date = new Date()) {
  const stats = await getStats(now);
  return {
    report_type: "dealpilot_anonymized_usage_metrics" as const,
    generated_at: now.toISOString(),
    local_only: true as const,
    contains_customer_identity: false as const,
    contains_message_content: false as const,
    metrics: stats.rolling_30_days,
    methodology: {
      on_time_completion:
        "滚动30天内，到期后24小时内完成的提醒数 / 到期提醒总数。至少20条提醒后再判断是否达到目标。",
      match_accuracy:
        "滚动30天内，经用户明确确认的自动唯一匹配会话数 / 经用户确认或纠正的自动唯一匹配会话总数；未评价的自动匹配不进入分母，同一会话只保留当前评价。",
      reminder_handling:
        "滚动30天内，已完成、曾执行稍后处理或明确忽略的提醒数 / 已触达提醒总数；稍后到期重新进入待处理状态仍保留本次处理计数。",
    },
  };
}

function metric<T extends Record<string, unknown>>(
  numerator: number,
  denominator: number,
  target: number,
  extra?: T,
) {
  return {
    numerator,
    denominator,
    rate: denominator > 0
      ? Math.round((numerator / denominator) * 10_000) / 10_000
      : null,
    target,
    ...extra,
  };
}
