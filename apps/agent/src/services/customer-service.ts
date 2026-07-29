/**
 * DealPilot 客户领域服务
 * 合并、软删除、恢复（事务）
 */

import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  customers,
  contacts,
  social_accounts,
  projects,
  follow_ups,
  reminders,
} from "../db/schema";
import { ApiError } from "../middleware/error-handler";
import type { CustomerMerge } from "@dealpilot/shared";

/**
 * 软删除客户
 * 设置 deleted_at，同时取消未完成提醒
 */
export async function softDeleteCustomer(customerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 检查客户存在且未删除
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), isNull(customers.deleted_at)))
      .limit(1);

    if (!customer) {
      throw ApiError.notFound("Customer not found");
    }

    const now = new Date().toISOString();

    // 软删除客户
    await tx
      .update(customers)
      .set({ deleted_at: now, updated_at: now })
      .where(eq(customers.id, customerId));

    // 取消未完成提醒
    await tx
      .update(reminders)
      .set({
        status: "ignored",
        updated_at: now,
        resolution: "Customer deleted",
      })
      .where(
        and(
          eq(reminders.customer_id, customerId),
          sql`${reminders.status} IN ('pending', 'snoozed', 'overdue')`,
        ),
      );
  });
}

/**
 * 恢复已删除客户
 */
export async function restoreCustomer(customerId: string) {
  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      throw ApiError.notFound("Customer not found");
    }
    if (!customer.deleted_at) {
      throw ApiError.conflict("Customer is not deleted");
    }

    const now = new Date().toISOString();
    await tx
      .update(customers)
      .set({ deleted_at: null, updated_at: now })
      .where(eq(customers.id, customerId));

    return customer;
  });
}

/**
 * 合并客户
 * 将 source 的跟进、项目、提醒、社媒迁移到 target
 */
export async function mergeCustomers(merge: CustomerMerge) {
  const { source_id, target_id, field_resolutions } = merge;

  if (source_id === target_id) {
    throw ApiError.badRequest("Source and target cannot be the same");
  }

  return db.transaction(async (tx) => {
    // 检查双方存在
    const [source] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, source_id))
      .limit(1);
    const [target] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, target_id))
      .limit(1);

    if (!source) throw ApiError.notFound("Source customer not found");
    if (!target) throw ApiError.notFound("Target customer not found");

    // 迁移联系人
    await tx
      .update(contacts)
      .set({ customer_id: target_id })
      .where(eq(contacts.customer_id, source_id));

    // 迁移社媒账号
    await tx
      .update(social_accounts)
      .set({ customer_id: target_id })
      .where(eq(social_accounts.customer_id, source_id));

    // 迁移项目
    await tx
      .update(projects)
      .set({ customer_id: target_id })
      .where(eq(projects.customer_id, source_id));

    // 迁移跟进记录
    await tx
      .update(follow_ups)
      .set({ customer_id: target_id })
      .where(eq(follow_ups.customer_id, source_id));

    // 迁移提醒
    await tx
      .update(reminders)
      .set({ customer_id: target_id })
      .where(eq(reminders.customer_id, source_id));

    // 如果有字段裁决，更新 target 字段
    if (field_resolutions) {
      const updates: Record<string, unknown> = {};
      for (const [field, choice] of Object.entries(field_resolutions)) {
        if (choice === "source") {
          const sourceValue = (source as Record<string, unknown>)[field];
          if (sourceValue !== undefined) {
            updates[field] = sourceValue;
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await tx.update(customers).set(updates).where(eq(customers.id, target_id));
      }
    }

    // 软删除 source（标记为已合并）
    const now = new Date().toISOString();
    await tx
      .update(customers)
      .set({
        deleted_at: now,
        updated_at: now,
      })
      .where(eq(customers.id, source_id));

    // 返回合并后的 target
    const [result] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, target_id))
      .limit(1);

    return result;
  });
}
