/**
 * DealPilot 路由 - Social Accounts
 * GET/POST /customers/:id/social-accounts, DELETE /social-accounts/:id
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { social_accounts, customers } from "../db/schema";
import { SocialAccountCreateSchema } from "@dealpilot/shared";
import { normalizePlatformIdentifier } from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";

const app = new Hono();

// GET /customers/:id/social-accounts - 社媒账号列表
app.get("/customers/:id/social-accounts", async (c) => {
  const customerId = c.req.param("id");

  // 验证客户存在
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deleted_at)))
    .limit(1);

  if (!customer) {
    throw ApiError.notFound("Customer not found");
  }

  const accounts = await db
    .select()
    .from(social_accounts)
    .where(eq(social_accounts.customer_id, customerId));

  return c.json(accounts);
});

// POST /customers/:id/social-accounts - 添加社媒账号
app.post(
  "/customers/:id/social-accounts",
  zValidator("json", SocialAccountCreateSchema),
  async (c) => {
    const customerId = c.req.param("id");
    const body = c.req.valid("json");

    // 验证客户存在
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), isNull(customers.deleted_at)))
      .limit(1);

    if (!customer) {
      throw ApiError.notFound("Customer not found");
    }

    const normalized = normalizePlatformIdentifier(body.platform, body.raw_identifier);

    // 检查唯一索引冲突
    const [existing] = await db
      .select()
      .from(social_accounts)
      .where(
        and(
          eq(social_accounts.platform, body.platform),
          eq(social_accounts.normalized_identifier, normalized),
        ),
      )
      .limit(1);

    if (existing) {
      throw ApiError.conflict("Social account already bound to a customer");
    }

    const [created] = await db
      .insert(social_accounts)
      .values({
        customer_id: customerId,
        contact_id: body.contact_id ?? null,
        platform: body.platform,
        raw_identifier: body.raw_identifier,
        normalized_identifier: normalized,
        manually_bound: false,
      })
      .returning();

    return c.json(created, 201);
  },
);

// DELETE /social-accounts/:id - 删除社媒账号
app.delete("/social-accounts/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(social_accounts).where(eq(social_accounts.id, id));
  return c.body(null, 204);
});

export default app;
