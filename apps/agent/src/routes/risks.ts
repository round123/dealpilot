import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { RiskCreateSchema, RiskUpdateSchema } from "@dealpilot/shared";
import { createRisk, updateRisk } from "../services/risk-service";

const app = new Hono();

app.post("/projects/:id/risks", zValidator("json", RiskCreateSchema), async (c) => {
  return c.json(await createRisk(c.req.param("id"), c.req.valid("json")), 201);
});

app.put("/risks/:id", zValidator("json", RiskUpdateSchema), async (c) => {
  return c.json(await updateRisk(c.req.param("id"), c.req.valid("json")));
});

export default app;
