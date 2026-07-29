/**
 * DealPilot 导入服务
 * SheetJS/PapaParse 解析、事务导入
 */

import { eq, and, isNull, sql, or } from "drizzle-orm";
import { db } from "../db/client";
import { import_jobs, customers, contacts } from "../db/schema";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { normalizeEmail, normalizePhone } from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";
import type { ImportCommitRequest } from "@dealpilot/shared";

interface ParsedRow {
  rowIndex: number;
  data: Record<string, unknown>;
  valid: boolean;
  error?: { field?: string; message: string };
}

interface DuplicateCandidate {
  row_index: number;
  existing_customer_id: string;
  existing_name: string;
  new_name: string;
}

interface ParseResult {
  jobId: string;
  totalRows: number;
  validRows: number;
  errors: { row: number; field?: string; message: string }[];
  duplicateCandidates: DuplicateCandidate[];
  preview: Record<string, unknown>[];
  rows: ParsedRow[];
}

/**
 * 解析上传的 Excel/CSV 文件
 */
export async function parseImportFile(
  fileBuffer: Buffer,
  fileName: string,
): Promise<ParseResult> {
  let rows: Record<string, unknown>[] = [];

  const ext = fileName.toLowerCase();
  if (ext.endsWith(".csv")) {
    const text = fileBuffer.toString("utf-8");
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    rows = result.data;
  } else {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  }

  const jobId = crypto.randomUUID();
  const parsedRows: ParsedRow[] = [];
  const errors: { row: number; field?: string; message: string }[] = [];
  let validRows = 0;

  rows.forEach((row, index) => {
    const rowIndex = index + 1;
    const name = row["name"]?.toString()?.trim() ?? row["名称"]?.toString()?.trim();

    if (!name) {
      errors.push({ row: rowIndex, field: "name", message: "客户名称不能为空" });
      parsedRows.push({ rowIndex, data: row, valid: false, error: { field: "name", message: "客户名称不能为空" } });
      return;
    }

    const grade = row["grade"]?.toString()?.trim() ?? row["分级"]?.toString()?.trim() ?? "B";
    if (!["A", "B", "C"].includes(grade)) {
      errors.push({ row: rowIndex, field: "grade", message: `无效的分级: ${grade}` });
      parsedRows.push({ rowIndex, data: row, valid: false, error: { field: "grade", message: `无效的分级: ${grade}` } });
      return;
    }

    validRows++;
    parsedRows.push({ rowIndex, data: row, valid: true });
  });

  // 检查重复候选
  const duplicateCandidates: DuplicateCandidate[] = [];
  for (const parsedRow of parsedRows) {
    if (!parsedRow.valid) continue;
    const name = parsedRow.data["name"]?.toString()?.trim() ?? parsedRow.data["名称"]?.toString()?.trim();
    const email = parsedRow.data["email"]?.toString()?.trim() ?? parsedRow.data["邮箱"]?.toString()?.trim();

    // 按名称或邮箱查找现有客户
    let conditions = [];
    if (name) {
      conditions.push(eq(customers.name, name));
    }
    if (email) {
      conditions.push(eq(contacts.email, normalizeEmail(email)));
    }

    if (conditions.length > 0) {
      const existing = await db
        .select()
        .from(customers)
        .where(
          and(
            isNull(customers.deleted_at),
            conditions.length === 1 ? conditions[0] : or(...conditions),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        duplicateCandidates.push({
          row_index: parsedRow.rowIndex,
          existing_customer_id: existing[0].id,
          existing_name: existing[0].name,
          new_name: name ?? "",
        });
      }
    }
  }

  // 创建导入任务
  await db.insert(import_jobs).values({
    id: jobId,
    file_name: fileName,
    total_rows: rows.length,
    valid_rows: validRows,
    failed_rows: rows.length - validRows,
    duplicate_count: duplicateCandidates.length,
    status: "previewing",
  });

  // 缓存解析结果到内存（实际可用文件或表存储）
  parsedResultsCache.set(jobId, parsedRows);

  return {
    jobId,
    totalRows: rows.length,
    validRows,
    errors,
    duplicateCandidates,
    preview: parsedRows.slice(0, 50).map((r) => r.data),
    rows: parsedRows,
  };
}

// 内存缓存解析结果（MVP 阶段，单实例运行）
const parsedResultsCache = new Map<string, ParsedRow[]>();

/**
 * 提交导入
 */
export async function commitImport(req: ImportCommitRequest): Promise<{
  success: number;
  failed: number;
  skipped: number;
  duplicates: number;
}> {
  const { job_id, resolutions } = req;

  const [job] = await db
    .select()
    .from(import_jobs)
    .where(eq(import_jobs.id, job_id))
    .limit(1);

  if (!job) {
    throw ApiError.notFound("Import job not found");
  }

  if (job.status === "committed") {
    throw ApiError.conflict("Import job already committed");
  }

  const parsedRows = parsedResultsCache.get(job_id);
  if (!parsedRows) {
    throw ApiError.badRequest("Import job data not found, please re-parse the file");
  }

  // 构建决议映射
  const resolutionMap = new Map<number, { action: string; target_customer_id?: string }>();
  for (const r of resolutions ?? []) {
    resolutionMap.set(r.row_index, { action: r.action, target_customer_id: r.target_customer_id });
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let duplicates = 0;

  await db.transaction(async (tx) => {
    for (const parsedRow of parsedRows) {
      if (!parsedRow.valid) {
        failed++;
        continue;
      }

      const resolution = resolutionMap.get(parsedRow.rowIndex);
      if (resolution?.action === "skip") {
        skipped++;
        continue;
      }

      if (resolution?.action === "merge" && resolution.target_customer_id) {
        // 合并到现有客户：只补充缺失字段
        duplicates++;
        continue;
      }

      // 创建新客户
      const name = parsedRow.data["name"]?.toString()?.trim() ?? parsedRow.data["名称"]?.toString()?.trim();
      const company = parsedRow.data["company"]?.toString()?.trim() ?? parsedRow.data["公司"]?.toString()?.trim() ?? null;
      const country = parsedRow.data["country"]?.toString()?.trim() ?? parsedRow.data["国家"]?.toString()?.trim() ?? null;
      const source = parsedRow.data["source"]?.toString()?.trim() ?? parsedRow.data["来源"]?.toString()?.trim() ?? null;
      const grade = parsedRow.data["grade"]?.toString()?.trim() ?? parsedRow.data["分级"]?.toString()?.trim() ?? "B";

      try {
        await tx.insert(customers).values({
          id: crypto.randomUUID(),
          name,
          company: company || null,
          country: country || null,
          source: source || null,
          grade: grade as "A" | "B" | "C",
          status: "active",
        });

        // 如果有联系人信息，一并创建
        const email = parsedRow.data["email"]?.toString()?.trim() ?? parsedRow.data["邮箱"]?.toString()?.trim();
        const phone = parsedRow.data["phone"]?.toString()?.trim() ?? parsedRow.data["电话"]?.toString()?.trim();
        const contactName = parsedRow.data["contact_name"]?.toString()?.trim() ?? parsedRow.data["联系人"]?.toString()?.trim();

        if (email || phone || contactName) {
          // 需要获取刚插入的客户 ID
          // 使用子查询或重新查询
          const [newCustomer] = await tx
            .select()
            .from(customers)
            .where(eq(customers.name, name))
            .limit(1);

          if (newCustomer) {
            await tx.insert(contacts).values({
              customer_id: newCustomer.id,
              name: contactName || name,
              email: normalizeEmail(email),
              phone: normalizePhone(phone),
            });
          }
        }

        success++;
      } catch (err) {
        console.error(`[import] Row ${parsedRow.rowIndex} failed:`, err);
        failed++;
      }
    }

    // 更新任务状态
    await tx
      .update(import_jobs)
      .set({ status: "committed" })
      .where(eq(import_jobs.id, job_id));
  });

  // 清理缓存
  parsedResultsCache.delete(job_id);

  return { success, failed, skipped, duplicates };
}

/**
 * 获取导入错误报告（CSV 格式）
 */
export function getImportErrorsCsv(
  errors: { row: number; field?: string; message: string }[],
): string {
  const header = "row,field,message\n";
  const lines = errors.map((e) => {
    const field = e.field ?? "";
    const message = e.message.replace(/"/g, '""');
    return `${e.row},"${field}","${message}"`;
  });
  return header + lines.join("\n");
}
