import { Hono } from "hono";
import {
  ReminderCreateSchema,
  ReminderListQuerySchema,
  ReminderStatusUpdateSchema,
} from "@dealpilot/shared";
import {
  createReminder,
  getPopupReminders,
  listReminders,
  updateReminderStatus,
} from "../services/reminder-service";
import { validateJson } from "../middleware/validation";

const app = new Hono();

app.get("/reminders/popup", async (c) => c.json(await getPopupReminders()));

app.get("/reminders", async (c) => {
  const query = ReminderListQuerySchema.parse({
    status: c.req.query("status"),
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit") ?? "50",
    sort_by: c.req.query("sort_by") ?? "due_at",
  });
  return c.json(await listReminders(query));
});

app.post("/reminders", validateJson(ReminderCreateSchema), async (c) => {
  return c.json(await createReminder(c.req.valid("json")), 201);
});

app.put("/reminders/:id", validateJson(ReminderStatusUpdateSchema), async (c) => {
  return c.json(await updateReminderStatus(c.req.param("id"), c.req.valid("json")));
});

export default app;
