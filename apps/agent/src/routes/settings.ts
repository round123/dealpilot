/**
 * DealPilot 路由 - Settings
 * GET/PUT /settings
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema";
import { SettingsUpdateSchema } from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";

const app = new Hono();

// GET /settings - 本地设置
app.get("/settings", async (c) => {
  const [result] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);

  if (!result) {
    // 如果没有设置行，创建默认行
    await db.insert(settings).values({ id: 1 });
    const [defaultResult] = await db
      .select()
      .from(settings)
      .where(eq(settings.id, 1))
      .limit(1);
    return c.json(defaultResult);
  }

  return c.json(result);
});

// PUT /settings - 更新设置
app.put("/settings", zValidator("json", SettingsUpdateSchema), async (c) => {
  const body = c.req.valid("json");

  // 确保设置行存在
  const [existing] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);

  if (!existing) {
    await db.insert(settings).values({ id: 1 });
  }

  const [updated] = await db
    .update(settings)
    .set(body)
    .where(eq(settings.id, 1))
    .returning();

  return c.json(updated);
});

export default app;
