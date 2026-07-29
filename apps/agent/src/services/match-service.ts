/**
 * DealPilot 会话身份匹配服务
 * 标准化、候选匹配
 */

import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { customers, social_accounts } from "../db/schema";
import { normalizePlatformIdentifier } from "@dealpilot/shared";
import type { MatchResolve, MatchResolveResponse, MatchBind } from "@dealpilot/shared";

/**
 * 解析会话身份：标准化 raw_identifier，查询 social_accounts 表
 * 返回 unique / multiple / none
 */
export async function resolveMatch(
  req: MatchResolve,
): Promise<MatchResolveResponse> {
  const normalized = normalizePlatformIdentifier(req.platform, req.raw_identifier);

  // 查询绑定关系
  const bindings = await db
    .select({
      customer: customers,
    })
    .from(social_accounts)
    .innerJoin(customers, eq(social_accounts.customer_id, customers.id))
    .where(
      and(
        eq(social_accounts.platform, req.platform),
        eq(social_accounts.normalized_identifier, normalized),
        isNull(customers.deleted_at),
      ),
    );

  if (bindings.length === 0) {
    return { status: "none" };
  }

  if (bindings.length === 1) {
    return {
      status: "unique",
      customer: bindings[0].customer,
    };
  }

  // 多个候选
  return {
    status: "multiple",
    candidates: bindings.map((b) => b.customer),
  };
}

/**
 * 人工绑定会话到客户
 */
export async function bindMatch(req: MatchBind) {
  const normalized = normalizePlatformIdentifier(req.platform, req.raw_identifier);

  // 检查客户存在
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(eq(customers.id, req.customer_id), isNull(customers.deleted_at)),
    )
    .limit(1);

  if (!customer) {
    throw new Error("Customer not found");
  }

  // 检查是否已存在相同 platform+normalized 的绑定
  const [existing] = await db
    .select()
    .from(social_accounts)
    .where(
      and(
        eq(social_accounts.platform, req.platform),
        eq(social_accounts.normalized_identifier, normalized),
      ),
    )
    .limit(1);

  if (existing) {
    // 更新绑定关系
    const [updated] = await db
      .update(social_accounts)
      .set({
        customer_id: req.customer_id,
        manually_bound: true,
      })
      .where(eq(social_accounts.id, existing.id))
      .returning();
    return updated;
  }

  // 创建新绑定
  const [created] = await db
    .insert(social_accounts)
    .values({
      customer_id: req.customer_id,
      platform: req.platform,
      raw_identifier: req.raw_identifier,
      normalized_identifier: normalized,
      manually_bound: true,
    })
    .returning();

  return created;
}

/**
 * 解绑会话
 */
export async function unbindMatch(
  platform: string,
  raw_identifier: string,
): Promise<void> {
  const normalized = normalizePlatformIdentifier(platform, raw_identifier);

  const [existing] = await db
    .select()
    .from(social_accounts)
    .where(
      and(
        eq(social_accounts.platform, platform),
        eq(social_accounts.normalized_identifier, normalized),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(social_accounts)
      .where(eq(social_accounts.id, existing.id));
  }
}
