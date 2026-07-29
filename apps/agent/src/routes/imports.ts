/**
 * DealPilot 路由 - Imports
 * POST /imports/parse, POST /imports/:job_id/commit, GET /imports/:job_id/errors
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { import_jobs } from "../db/schema";
import { ImportCommitRequestSchema } from "@dealpilot/shared";
import { parseImportFile, commitImport, getImportErrorsCsv } from "../services/import-service";
import { ApiError } from "../middleware/error-handler";

const app = new Hono();

// POST /imports/parse - 解析 Excel/CSV 并预览
app.post("/imports/parse", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    throw ApiError.badRequest("No file uploaded");
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const result = await parseImportFile(fileBuffer, file.name);

  return c.json(result);
});

// POST /imports/:job_id/commit - 确认提交导入
app.post(
  "/imports/:job_id/commit",
  zValidator("json", ImportCommitRequestSchema),
  async (c) => {
    const jobId = c.req.param("job_id");
    const body = c.req.valid("json");
    const result = await commitImport({ ...body, job_id: jobId });
    return c.json(result);
  },
);

// GET /imports/:job_id/errors - 下载错误报告
app.get("/imports/:job_id/errors", async (c) => {
  const jobId = c.req.param("job_id");

  const [job] = await db
    .select()
    .from(import_jobs)
    .where(eq(import_jobs.id, jobId))
    .limit(1);

  if (!job) {
    throw ApiError.notFound("Import job not found");
  }

  // 从内存缓存中获取错误信息（简化实现）
  // 实际应从 import_job_errors 表或文件中读取
  const csv = "row,field,message\n";

  c.header("Content-Type", "text/csv");
  c.header("Content-Disposition", `attachment; filename="import-errors-${jobId}.csv"`);
  return c.body(csv);
});

export default app;
