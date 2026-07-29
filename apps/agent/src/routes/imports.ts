import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ImportCommitRequestSchema } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  commitImport,
  getImportErrorsCsv,
  parseImportFile,
} from "../services/import-service";

const app = new Hono();

app.post("/imports/parse", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw ApiError.badRequest("No file uploaded");
  return c.json(await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name));
});

app.post(
  "/imports/:job_id/commit",
  zValidator("json", ImportCommitRequestSchema),
  async (c) => c.json(await commitImport({
    ...c.req.valid("json"),
    job_id: c.req.param("job_id"),
  })),
);

app.get("/imports/:job_id/errors", async (c) => {
  const jobId = c.req.param("job_id");
  const csv = await getImportErrorsCsv(jobId);
  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", `attachment; filename="import-errors-${jobId}.csv"`);
  return c.body(csv);
});

export default app;
