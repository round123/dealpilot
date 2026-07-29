import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { BackupCreateSchema } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import { createBackup, restoreBackup, validateBackup } from "../services/backup-service";

const app = new Hono();

app.post("/backups/create", zValidator("json", BackupCreateSchema), async (c) => {
  const buffer = await createBackup(c.req.valid("json").password);
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Disposition", `attachment; filename="dealpilot-backup-${Date.now()}.dpbk"`);
  return c.body(new Uint8Array(buffer));
});

app.post("/backups/validate", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");
  const password = formData.get("password");
  if (!(file instanceof File) || typeof password !== "string") {
    throw ApiError.badRequest("Missing file or password");
  }
  return c.json(await validateBackup(Buffer.from(await file.arrayBuffer()), password));
});

app.post("/backups/restore", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");
  const password = formData.get("password");
  if (!(file instanceof File) || typeof password !== "string") {
    throw ApiError.badRequest("Missing file or password");
  }
  return c.json(await restoreBackup(Buffer.from(await file.arrayBuffer()), password));
});

export default app;
