import { Hono } from "hono";
import {
  RiskCreateSchema,
  RiskListQuerySchema,
  RiskUpdateSchema,
} from "@dealpilot/shared";
import {
  createRisk,
  deleteRisk,
  listRisks,
  updateRisk,
} from "../services/risk-service";
import { validateJson, validateQuery } from "../middleware/validation";

const app = new Hono();

app.get("/risks", validateQuery(RiskListQuerySchema), async (c) =>
  c.json(await listRisks(c.req.valid("query"))),
);

app.post("/projects/:id/risks", validateJson(RiskCreateSchema), async (c) => {
  return c.json(await createRisk(c.req.param("id"), c.req.valid("json")), 201);
});

app.put("/risks/:id", validateJson(RiskUpdateSchema), async (c) => {
  return c.json(await updateRisk(c.req.param("id"), c.req.valid("json")));
});

app.delete("/risks/:id", async (c) => {
  await deleteRisk(c.req.param("id"));
  return c.body(null, 204);
});

export default app;
