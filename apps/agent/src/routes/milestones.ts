/**
 * DealPilot 路由 - Milestones
 * POST /projects/:id/milestones, PUT /milestones/:id
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { milestones, projects } from "../db/schema";
import { MilestoneCreateSchema, MilestoneUpdateSchema } from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";

const app = new Hono();

// POST /projects/:id/milestones - 添加里程碑
app.post("/projects/:id/milestones", zValidator("json", MilestoneCreateSchema), async (c) => {
  const projectId = c.req.param("id");
  const body = c.req.valid("json");

  // 验证项目存在
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    throw ApiError.notFound("Project not found");
  }

  const [created] = await db
    .insert(milestones)
    .values({
      project_id: projectId,
      name: body.name,
      date: body.date,
      completed: false,
    })
    .returning();

  return c.json(created, 201);
});

// PUT /milestones/:id - 更新里程碑完成状态
app.put("/milestones/:id", zValidator("json", MilestoneUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [updated] = await db
    .update(milestones)
    .set({ completed: body.completed })
    .where(eq(milestones.id, id))
    .returning();

  if (!updated) {
    throw ApiError.notFound("Milestone not found");
  }

  return c.json(updated);
});

export default app;
