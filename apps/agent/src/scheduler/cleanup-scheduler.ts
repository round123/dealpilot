/**
 * DealPilot 调度器 - 清理调度
 * 软删除 30 天后永久删除
 */

import { eq, lte, and, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { customers } from "../db/schema";
import { SOFT_DELETE_RETENTION_DAYS } from "@dealpilot/shared";

let timer: ReturnType<typeof setInterval> | null = null;

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 每 24 小时执行一次
const RETENTION_MS = SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * 启动清理调度器
 */
export function startCleanupScheduler(): void {
  if (timer) return;
  timer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  // 启动时延迟执行一次（避免与迁移冲突）
  setTimeout(runCleanup, 10_000);
}

/**
 * 停止清理调度器
 */
export function stopCleanupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * 执行清理：永久删除超过保留期的软删除记录
 */
async function runCleanup() {
  const cutoffDate = new Date(Date.now() - RETENTION_MS).toISOString();

  try {
    // 查找超过保留期的软删除客户
    const expiredCustomers = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          isNotNull(customers.deleted_at),
          lte(customers.deleted_at, cutoffDate),
        ),
      );

    for (const { id } of expiredCustomers) {
      // 永久删除客户及其关联数据（外键级联删除会处理关联表）
      await db.delete(customers).where(eq(customers.id, id));
    }

    if (expiredCustomers.length > 0) {
      console.log(`[cleanup] Permanently deleted ${expiredCustomers.length} customers`);
    }
  } catch (err) {
    console.error("[cleanup] Error during cleanup:", err);
  }
}
