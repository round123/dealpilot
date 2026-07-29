import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  FollowUpCreateSchema,
  FollowUpListQuerySchema,
  FollowUpUpdateSchema,
} from "@dealpilot/shared";
import {
  createFollowUp,
  deleteFollowUp,
  listFollowUps,
  updateFollowUp,
} from "../services/follow-up-service";

const app = new Hono();

app.get("/follow-ups", async (c) => {
  const query = FollowUpListQuerySchema.parse({
    customer_id: c.req.query("customer_id"),
    project_id: c.req.query("project_id"),
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit") ?? "20",
  });
  return c.json(await listFollowUps(query));
});

app.post("/follow-ups", zValidator("json", FollowUpCreateSchema), async (c) => {
  return c.json(await createFollowUp(c.req.valid("json")), 201);
});

app.put("/follow-ups/:id", zValidator("json", FollowUpUpdateSchema), async (c) => {
  return c.json(await updateFollowUp(c.req.param("id"), c.req.valid("json")));
});

app.delete("/follow-ups/:id", async (c) => {
  await deleteFollowUp(c.req.param("id"));
  return c.body(null, 204);
});

export default app;
