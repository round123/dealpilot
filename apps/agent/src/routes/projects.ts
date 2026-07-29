/**
 * DealPilot 路由 - Projects
 * GET/POST /projects, GET/PUT/DELETE /projects/:id, PUT /projects/:id/stage
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, isNull, asc, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  projects,
  risks,
  milestones,
  reminders,
} from "../db/schema";
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ProjectStageUpdateSchema,
  ProjectListQuerySchema,
} from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";

const app = new Hono();

// DELETE /projects/:id 的 body schema
const ProjectDeleteSchema = z.object({
  reason: z.string().optional(),
});

// GET /projects - 项目列表
app.get("/projects", async (c) => {
  const params = ProjectListQuerySchema.parse({
    customer_id: c.req.query("customer_id"),
    stage: c.req.query("stage"),
    grade: c.req.query("grade"),
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit") ?? "20",
  });

  const conditions = [];
  if (params.customer_id) {
    conditions.push(eq(projects.customer_id, params.customer_id));
  }
  if (params.stage) {
    conditions.push(eq(projects.stage, params.stage));
  }
  if (params.grade) {
    conditions.push(eq(projects.grade, params.grade));
  }

  const baseQuery = db
    .select()
    .from(projects)
    .orderBy(asc(projects.created_at))
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

// POST /projects - 新建项目
app.post("/projects", zValidator("json", ProjectCreateSchema), async (c) => {
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const [created] = await db
    .insert(projects)
    .values({
      customer_id: body.customer_id,
      name: body.name,
      currency: body.currency,
      amount: body.amount ?? null,
      probability: body.probability ?? null,
      expected_close_date: body.expected_close_date ?? null,
      stage: body.stage,
      grade: body.grade,
      created_at: now,
      updated_at: now,
    })
    .returning();

  return c.json(created, 201);
});

// GET /projects/:id - 项目详情
app.get("/projects/:id", async (c) => {
  const id = c.req.param("id");

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!project) {
    throw ApiError.notFound("Project not found");
  }

  const projectRisks = await db
    .select()
    .from(risks)
    .where(eq(risks.project_id, id));

  const projectMilestones = await db
    .select()
    .from(milestones)
    .where(eq(milestones.project_id, id));

  const openReminders = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.project_id, id),
        sql`${reminders.status} IN ('pending', 'snoozed', 'overdue')`,
      ),
    )
    .orderBy(asc(reminders.due_at));

  return c.json({
    ...project,
    risks: projectRisks,
    milestones: projectMilestones,
    open_reminders: openReminders,
  });
});

// PUT /projects/:id - 编辑项目
app.put("/projects/:id", zValidator("json", ProjectUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const [updated] = await db
    .update(projects)
    .set({ ...body, updated_at: now })
    .where(eq(projects.id, id))
    .returning();

  if (!updated) {
    throw ApiError.notFound("Project not found");
  }

  return c.json(updated);
});

// PUT /projects/:id/stage - 切换项目阶段
app.put("/projects/:id/stage", zValidator("json", ProjectStageUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const [updated] = await db
    .update(projects)
    .set({ stage: body.stage, updated_at: now })
    .where(eq(projects.id, id))
    .returning();

  if (!updated) {
    throw ApiError.notFound("Project not found");
  }

  return c.json(updated);
});

// DELETE /projects/:id - 归档/关闭项目
app.delete("/projects/:id", zValidator("json", ProjectDeleteSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const [updated] = await db
    .update(projects)
    .set({
      stage: "archived",
      closed_reason: body.reason ?? null,
      updated_at: now,
    })
    .where(eq(projects.id, id))
    .returning();

  if (!updated) {
    throw ApiError.notFound("Project not found");
  }

  return c.body(null, 204);
});

export default app;
