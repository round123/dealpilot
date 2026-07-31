import { Hono } from "hono";
import { ClearLocalDataSchema } from "@dealpilot/shared";
import { validateJson } from "../middleware/validation";
import { clearLocalData, getLocalDataInfo } from "../services/system-service";

const app = new Hono();

app.get("/system/local-data", async (c) => c.json(await getLocalDataInfo()));

app.post(
  "/system/local-data/clear",
  validateJson(ClearLocalDataSchema),
  async (c) => c.json(await clearLocalData(c.req.valid("json"))),
);

export default app;
