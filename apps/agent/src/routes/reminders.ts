/**
 * DealPilot 路由 - Reminders
 * GET/POST /reminders, PUT /reminders/:id, GET /reminders/popup
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, asc, sql, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { reminders, customers } from "../db/schema";
import {
  ReminderCreateSchema,
  ReminderStatusUpdateSchema,
  ReminderListQuerySchema,
} from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";
import {
  updateReminderStatus,
  getPopupReminders,
  checkDuplicateReminder,
} from "../services/reminder-service";

const app = new Hono();

// GET /reminders/popup - popup 前5条待办（需在 /:id 路由之前定义）
app.get("/reminders/popup", async (c) => {
  const result = await getPopupReminders();
  return c.json(result);
});

// GET /reminders - 提醒列表
app.get("/reminders", async (c) => {
  const params = ReminderListQuerySchema.parse({
    status: c.req.query("status"),
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit") ?? "50",
    sort_by: c.req.query("sort_by") ?? "due_at",
  });

  const conditions = [isNull(customers.deleted_at)];

  if (params.status) {
    conditions.push(eq(reminders.status, params.status));
  }

  const sortColumn = params.sort_by === "priority" ? reminders.priority
    : params.sort_by === "created_at" ? reminders.created_at
    : reminders.due_at;

  const allRows = await db
    .select({
      reminder: reminders,
      customer: customers,
    })
    .from(reminders)
    .innerJoin(customers, eq(reminders.customer_id, customers.id))
    .where(and(...conditions))
    .orderBy(asc(sortColumn))
    .limit(params.limit + 1);

  let results = allRows.map((r) => r.reminder);
  let nextCursor: string | null = null;
  if (results.length > params.limit) {
    results = results.slice(0, params.limit);
    nextCursor = results[results.length - 1].id;
  }

  return c.json({ items: results, next_cursor: nextCursor });
});

// POST /reminders - 新建提醒
app.post("/reminders", zValidator("json", ReminderCreateSchema), async (c) => {
  const body = c.req.valid("json");

  // 去重检查
  const isDuplicate = await checkDuplicateReminder(
    body.customer_id,
    body.type,
    body.due_at,
  );
  if (isDuplicate) {
    throw ApiError.conflict("Duplicate reminder already exists");
  }

  const now = new Date().toISOString();

  const [created] = await db
    .insert(reminders)
    .values({
      customer_id: body.customer_id,
      project_id: body.project_id ?? null,
      type: body.type,
      status: "pending",
      due_at: body.due_at,
      priority: body.priority,
      created_at: now,
      updated_at: now,
    })
    .returning();

  return c.json(created, 201);
});

// PUT /reminders/:id - 更新提醒状态
app.put("/reminders/:id", zValidator("json", ReminderStatusUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const updated = await updateReminderStatus(id, body);
  return c.json(updated);
});

export default app;
