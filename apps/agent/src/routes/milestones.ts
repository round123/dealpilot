import { Hono } from "hono";
import {
  MilestoneCreateSchema,
  MilestoneListQuerySchema,
  MilestoneUpdateSchema,
} from "@dealpilot/shared";
import {
  createMilestone,
  deleteMilestone,
  listMilestones,
  updateMilestone,
} from "../services/milestone-service";
import { validateJson, validateQuery } from "../middleware/validation";

const app = new Hono();

app.get("/milestones", validateQuery(MilestoneListQuerySchema), async (c) =>
  c.json(await listMilestones(c.req.valid("query"))),
);

app.post(
  "/projects/:id/milestones",
  validateJson(MilestoneCreateSchema),
  async (c) => {
    return c.json(
      await createMilestone(c.req.param("id"), c.req.valid("json")),
      201,
    );
  },
);

app.put("/milestones/:id", validateJson(MilestoneUpdateSchema), async (c) => {
  return c.json(await updateMilestone(c.req.param("id"), c.req.valid("json")));
});

app.delete("/milestones/:id", async (c) => {
  await deleteMilestone(c.req.param("id"));
  return c.body(null, 204);
});

export default app;
