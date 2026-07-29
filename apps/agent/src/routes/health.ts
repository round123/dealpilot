/**
 * DealPilot 路由 - Health
 * GET /api/v1/health
 */

import { Hono } from "hono";
import { config } from "../config/config";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({
    agent_version: config.appVersion,
    api_version: config.apiVersion,
    db_schema_version: config.dbSchemaVersion,
    platform_adapter_version: "0.1.0",
  });
});

export default app;
