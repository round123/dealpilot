import { Hono } from "hono";
import { SettingsUpdateSchema } from "@dealpilot/shared";
import { validateJson } from "../middleware/validation";
import { getSettings, updateSettings } from "../services/settings-service";

const app = new Hono();

app.get("/settings", async (c) => c.json(await getSettings()));

app.put("/settings", validateJson(SettingsUpdateSchema), async (c) => {
  return c.json(await updateSettings(c.req.valid("json")));
});

export default app;
