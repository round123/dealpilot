/**
 * DealPilot 路由 - Risks
 * POST /projects/:id/risks, PUT /risks/:id
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { risks, projects } from "../db/schema";
import { RiskCreateSchema, RiskUpdateSchema } from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";

const app = new Hono();

// POST /projects/:id/risks - 添加风险
app.post("/projects/:id/risks", zValidator("json", RiskCreateSchema), async (c) => {
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
    .insert(risks)
    .values({
      project_id: projectId,
      description: body.description,
      severity: body.severity,
      status: "open",
    })
    .returning();

  return c.json(created, 201);
});

// PUT /risks/:id - 更新风险状态
app.put("/risks/:id", zValidator("json", RiskUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const updates: Record<string, unknown> = {};
  if (body.severity !== undefined) updates.severity = body.severity;
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "resolved" || body.status === "ignored") {
      updates.handled_at = new Date().toISOString();
    }
  }

  const [updated] = await db
    .update(risks)
    .set(updates)
    .where(eq(risks.id, id))
    .returning();

  if (!updated) {
    throw ApiError.notFound("Risk not found");
  }

  return c.json(updated);
});

export default app;
