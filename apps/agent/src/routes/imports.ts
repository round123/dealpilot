import { Hono } from "hono";
import {
  ImportCommitRequestSchema,
  ImportParseRequestSchema,
} from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  commitImport,
  getImportErrorsCsv,
  parseImportFile,
} from "../services/import-service";
import { validateJson } from "../middleware/validation";

const app = new Hono();

app.post("/imports/parse", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw ApiError.validation({ file: ["No file uploaded"] });
  }
  const mapping = parseMapping(formData.get("mapping"));
  return c.json(
    await parseImportFile(
      Buffer.from(await file.arrayBuffer()),
      file.name,
      mapping,
    ),
  );
});

app.post(
  "/imports/:job_id/commit",
  validateJson(ImportCommitRequestSchema),
  async (c) =>
    c.json(
      await commitImport({
        ...c.req.valid("json"),
        job_id: c.req.param("job_id"),
      }),
    ),
);

app.get("/imports/:job_id/errors", async (c) => {
  const jobId = c.req.param("job_id");
  const csv = await getImportErrorsCsv(jobId);
  c.header("Content-Type", "text/csv");
  c.header(
    "Content-Disposition",
    `attachment; filename="import-errors-${jobId}.csv"`,
  );
  return c.body(csv);
});

export default app;

function parseMapping(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  if (typeof value !== "string") {
    throw ApiError.validation({ mapping: ["Mapping must be a JSON object"] });
  }

  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    throw ApiError.validation({ mapping: ["Mapping must be valid JSON"] });
  }

  const result = ImportParseRequestSchema.safeParse({ mapping: input });
  if (result.success) return result.data.mapping;

  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") || "mapping";
    (fields[field] ??= []).push(issue.message);
  }
  throw ApiError.validation(fields);
}
