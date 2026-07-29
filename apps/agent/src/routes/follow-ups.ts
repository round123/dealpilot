/**
 * DealPilot 路由 - Follow-ups
 * GET/POST /follow-ups, PUT/DELETE /follow-ups/:id
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client";
import { follow_ups } from "../db/schema";
import {
  FollowUpCreateSchema,
  FollowUpUpdateSchema,
  FollowUpListQuerySchema,
} from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";

const app = new Hono();

// GET /follow-ups - 跟进记录列表
app.get("/follow-ups", async (c) => {
  const params = FollowUpListQuerySchema.parse({
    customer_id: c.req.query("customer_id"),
    project_id: c.req.query("project_id"),
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit") ?? "20",
  });

  const conditions = [];
  if (params.customer_id) {
    conditions.push(eq(follow_ups.customer_id, params.customer_id));
  }
  if (params.project_id) {
    conditions.push(eq(follow_ups.project_id, params.project_id));
  }

  const baseQuery = db
    .select()
    .from(follow_ups)
    .orderBy(desc(follow_ups.occurred_at))
    .limit(params.limit + 1);

  const allRows = conditions.length > 0
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;

  let results = allRows;
  let nextCursor: string | null = null;
  if (allRows.length > params.limit) {
    results = allRows.slice(0, params.limit);
    nextCursor = results[results.length - 1].id;
  }

  return c.json({ items: results, next_cursor: nextCursor });
});

// POST /follow-ups - 新建跟进记录
app.post("/follow-ups", zValidator("json", FollowUpCreateSchema), async (c) => {
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const [created] = await db
    .insert(follow_ups)
    .values({
      customer_id: body.customer_id,
      project_id: body.project_id ?? null,
      type: body.type,
      note: body.note ?? null,
      message_body: body.message_body ?? null,
      message_direction: body.message_direction ?? null,
      occurred_at: body.occurred_at,
      created_at: now,
    })
    .returning();

  return c.json(created, 201);
});

// PUT /follow-ups/:id - 编辑跟进记录
app.put("/follow-ups/:id", zValidator("json", FollowUpUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [updated] = await db
    .update(follow_ups)
    .set(body)
    .where(eq(follow_ups.id, id))
    .returning();

  if (!updated) {
    throw ApiError.notFound("Follow-up not found");
  }

  return c.json(updated);
});

// DELETE /follow-ups/:id - 删除跟进记录
app.delete("/follow-ups/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(follow_ups).where(eq(follow_ups.id, id));
  return c.body(null, 204);
});

export default app;
