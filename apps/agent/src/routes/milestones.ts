import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { MilestoneCreateSchema, MilestoneUpdateSchema } from "@dealpilot/shared";
import { createMilestone, updateMilestone } from "../services/milestone-service";

const app = new Hono();

app.post("/projects/:id/milestones", zValidator("json", MilestoneCreateSchema), async (c) => {
  return c.json(await createMilestone(c.req.param("id"), c.req.valid("json")), 201);
});

app.put("/milestones/:id", zValidator("json", MilestoneUpdateSchema), async (c) => {
  return c.json(await updateMilestone(c.req.param("id"), c.req.valid("json")));
});

export default app;
