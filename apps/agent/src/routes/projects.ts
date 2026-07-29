import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  ProjectCreateSchema,
  ProjectListQuerySchema,
  ProjectStageUpdateSchema,
  ProjectUpdateSchema,
} from "@dealpilot/shared";
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  updateProject,
  updateProjectStage,
} from "../services/project-service";

const app = new Hono();
const ProjectDeleteSchema = z.object({ reason: z.string().optional() });

app.get("/projects", async (c) => {
  const query = ProjectListQuerySchema.parse({
    customer_id: c.req.query("customer_id"),
    stage: c.req.query("stage"),
    grade: c.req.query("grade"),
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit") ?? "20",
  });
  return c.json(await listProjects(query));
});

app.post("/projects", zValidator("json", ProjectCreateSchema), async (c) => {
  return c.json(await createProject(c.req.valid("json")), 201);
});

app.get("/projects/:id", async (c) => c.json(await getProject(c.req.param("id"))));

app.put("/projects/:id", zValidator("json", ProjectUpdateSchema), async (c) => {
  return c.json(await updateProject(c.req.param("id"), c.req.valid("json")));
});

app.put("/projects/:id/stage", zValidator("json", ProjectStageUpdateSchema), async (c) => {
  return c.json(await updateProjectStage(c.req.param("id"), c.req.valid("json")));
});

app.delete("/projects/:id", zValidator("json", ProjectDeleteSchema), async (c) => {
  await archiveProject(c.req.param("id"), c.req.valid("json").reason);
  return c.body(null, 204);
});

export default app;
