import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SettingsUpdateSchema } from "@dealpilot/shared";
import { getSettings, updateSettings } from "../services/settings-service";

const app = new Hono();

app.get("/settings", async (c) => c.json(await getSettings()));

app.put("/settings", zValidator("json", SettingsUpdateSchema), async (c) => {
  return c.json(await updateSettings(c.req.valid("json")));
});

export default app;
