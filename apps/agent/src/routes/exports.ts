import { Hono } from "hono";
import { z } from "zod";
import {
  exportAllBusinessData,
  exportCustomers,
} from "../services/export-service";
import { validateJson } from "../middleware/validation";

const app = new Hono();
const ExportRequestSchema = z.object({
  filters: z.object({
    search: z.string().optional(),
    grade: z.enum(["A", "B", "C"]).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  }).optional(),
});

app.post("/exports/customers", validateJson(ExportRequestSchema), async (c) => {
  const buffer = await exportCustomers(c.req.valid("json").filters);
  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  c.header("Content-Disposition", `attachment; filename="customers-export-${Date.now()}.xlsx"`);
  return c.body(new Uint8Array(buffer));
});

app.post("/exports/all", async (c) => {
  const buffer = await exportAllBusinessData();
  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  c.header("Content-Disposition", `attachment; filename="dealpilot-all-data-${Date.now()}.xlsx"`);
  return c.body(new Uint8Array(buffer));
});

export default app;
