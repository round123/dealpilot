import { Hono } from "hono";
import {
  getAnonymizedUsageMetricsReport,
  getStats,
} from "../services/stats-service";

const app = new Hono();

app.get("/stats", async (c) => c.json(await getStats()));

app.get("/stats/export", async (c) => {
  const report = await getAnonymizedUsageMetricsReport();
  c.header("Content-Type", "application/json; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="dealpilot-metrics-${Date.now()}.json"`,
  );
  return c.body(JSON.stringify(report, null, 2));
});

export default app;
