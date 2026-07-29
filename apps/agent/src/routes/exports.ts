/**
 * DealPilot 路由 - Exports
 * POST /exports/customers
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq, and, isNull, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { customers, contacts, projects, follow_ups, reminders } from "../db/schema";
import * as XLSX from "xlsx";

const app = new Hono();

const ExportRequestSchema = z.object({
  filters: z.object({
    search: z.string().optional(),
    grade: z.enum(["A", "B", "C"]).optional(),
    status: z.string().optional(),
  }).optional(),
});

// POST /exports/customers - 导出客户 Excel
app.post("/exports/customers", zValidator("json", ExportRequestSchema), async (c) => {
  const body = c.req.valid("json");
  const filters = body?.filters;

  const conditions = [isNull(customers.deleted_at)];
  if (filters?.search) {
    const searchPattern = `%${filters.search}%`;
    conditions.push(
      or(
        like(customers.name, searchPattern),
        like(customers.company, searchPattern),
      )!,
    );
  }
  if (filters?.grade) {
    conditions.push(eq(customers.grade, filters.grade));
  }
  if (filters?.status) {
    conditions.push(eq(customers.status, filters.status));
  }

  const customerList = await db
    .select()
    .from(customers)
    .where(and(...conditions));

  // 构建多 sheet 工作簿
  const workbook = XLSX.utils.book_new();

  // 客户 sheet
  const customerSheet = XLSX.utils.json_to_sheet(
    customerList.map((c) => ({
      ID: c.id,
      名称: c.name,
      公司: c.company ?? "",
      国家: c.country ?? "",
      来源: c.source ?? "",
      分级: c.grade,
      状态: c.status,
      创建时间: c.created_at,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, customerSheet, "客户");

  // 导出为 buffer
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;

  c.header(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  c.header(
    "Content-Disposition",
    `attachment; filename="customers-export-${Date.now()}.xlsx"`,
  );
  return c.body(buffer);
});

export default app;
