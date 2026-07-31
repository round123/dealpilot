import * as XLSX from "xlsx";
import Papa from "papaparse";
import { normalizeEmail, normalizePhone } from "@dealpilot/shared";
import type { ImportCommitRequest } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  commitImportRows,
  findDuplicateCustomer,
  findImportJob,
} from "../repositories/import-repository";
import type {
  ImportCustomerRow,
  ImportJobMetadata,
} from "../repositories/import-repository";
import {
  applyImportFieldMapping,
  getImportSourceColumns,
  type ImportFieldMapping,
} from "./import-mapping";

interface ParsedRow {
  rowIndex: number;
  data: Record<string, unknown>;
  valid: boolean;
}

interface CachedImport {
  rows: ParsedRow[];
  duplicateRows: Set<number>;
  job: ImportJobMetadata;
}

type ImportError = { row: number; field?: string; message: string };

const parsedResultsCache = new Map<string, CachedImport>();
const errorReportCache = new Map<string, ImportError[]>();

function value(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const result = row[key]?.toString().trim();
    if (result) return result;
  }
  return undefined;
}

function toCustomerRow(
  row: ParsedRow,
): Omit<ImportCustomerRow, "action" | "targetCustomerId"> {
  const grade = value(row.data, "grade", "分级") ?? "B";
  return {
    valid: row.valid,
    name: value(row.data, "name", "名称") ?? "",
    company: value(row.data, "company", "公司") ?? null,
    country: value(row.data, "country", "国家") ?? null,
    source: value(row.data, "source", "来源") ?? null,
    grade: grade as "A" | "B" | "C",
    contactName: value(row.data, "contact_name", "联系人") ?? null,
    email: normalizeEmail(value(row.data, "email", "邮箱")),
    phone: normalizePhone(value(row.data, "phone", "电话")),
  };
}

export async function parseImportFile(
  fileBuffer: Buffer,
  fileName: string,
  mapping?: ImportFieldMapping,
) {
  let rows: Record<string, unknown>[];
  if (fileName.toLowerCase().endsWith(".csv")) {
    const parsed = Papa.parse<Record<string, unknown>>(
      fileBuffer.toString("utf-8"),
      {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      },
    );
    if (parsed.errors.length > 0) {
      throw ApiError.badRequest("CSV parse failed", parsed.errors);
    }
    rows = parsed.data;
  } else if (/\.xlsx?$/i.test(fileName)) {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw ApiError.badRequest("Workbook has no worksheet");
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);
  } else {
    throw ApiError.badRequest("Only .xlsx, .xls and .csv files are supported");
  }

  const sourceColumns = getImportSourceColumns(rows);
  if (mapping) {
    rows = applyImportFieldMapping(rows, mapping, sourceColumns);
  }

  const errors: ImportError[] = [];
  const parsedRows = rows.map((data, index): ParsedRow => {
    const rowIndex = index + 1;
    const name = value(data, "name", "名称");
    const grade = value(data, "grade", "分级") ?? "B";
    if (!name) {
      errors.push({
        row: rowIndex,
        field: "name",
        message: "客户名称不能为空",
      });
      return { rowIndex, data, valid: false };
    }
    if (!["A", "B", "C"].includes(grade)) {
      errors.push({
        row: rowIndex,
        field: "grade",
        message: `无效的分级: ${grade}`,
      });
      return { rowIndex, data, valid: false };
    }
    return { rowIndex, data, valid: true };
  });

  const duplicateCandidates = [];
  const duplicateRows = new Set<number>();
  for (const row of parsedRows) {
    if (!row.valid) continue;
    const customer = toCustomerRow(row);
    const existing = await findDuplicateCustomer(customer.name, customer.email);
    if (!existing) continue;
    duplicateRows.add(row.rowIndex);
    duplicateCandidates.push({
      row_index: row.rowIndex,
      existing_customer_id: existing.id,
      existing_name: existing.name,
      new_name: customer.name,
    });
  }

  const jobId = crypto.randomUUID();
  const validRows = parsedRows.filter(({ valid }) => valid).length;
  const job = {
    fileName,
    totalRows: rows.length,
    validRows,
    failedRows: rows.length - validRows,
    duplicateCount: duplicateCandidates.length,
  };
  parsedResultsCache.set(jobId, { rows: parsedRows, duplicateRows, job });
  errorReportCache.set(jobId, errors);

  return {
    job_id: jobId,
    total_rows: rows.length,
    valid_rows: validRows,
    errors,
    duplicate_candidates: duplicateCandidates,
    source_columns: sourceColumns,
    preview: parsedRows.slice(0, 50).map(({ data }) => data),
  };
}

export async function commitImport(request: ImportCommitRequest) {
  const job = await findImportJob(request.job_id);
  if (job?.status === "committed")
    throw ApiError.conflict("Import job already committed");
  const cached = parsedResultsCache.get(request.job_id);
  if (!cached) {
    throw ApiError.badRequest(
      "Import job data not found, please re-parse the file",
    );
  }

  const resolutions = new Map(
    (request.resolutions ?? []).map((item) => [item.row_index, item]),
  );
  for (const rowIndex of cached.duplicateRows) {
    if (!resolutions.has(rowIndex)) {
      throw ApiError.badRequest(
        `Duplicate row ${rowIndex} requires an explicit resolution`,
      );
    }
  }

  const rows: ImportCustomerRow[] = cached.rows.map((row) => {
    const resolution = resolutions.get(row.rowIndex);
    if (resolution?.action === "merge" && !resolution.target_customer_id) {
      throw ApiError.badRequest(
        `Merge row ${row.rowIndex} requires target_customer_id`,
      );
    }
    return {
      ...toCustomerRow(row),
      action: !row.valid
        ? "skip"
        : resolution?.action === "merge"
          ? "merge"
          : resolution?.action === "skip"
            ? "skip"
            : "create",
      targetCustomerId: resolution?.target_customer_id,
    };
  });

  const result = await commitImportRows(request.job_id, rows, cached.job);
  parsedResultsCache.delete(request.job_id);
  return result;
}

export async function getImportErrorsCsv(jobId: string) {
  if (!parsedResultsCache.has(jobId) && !(await findImportJob(jobId))) {
    throw ApiError.notFound("Import job not found");
  }
  const header = "row,field,message\n";
  const lines = (errorReportCache.get(jobId) ?? []).map((error) => {
    const field = (error.field ?? "").replace(/"/g, '""');
    const message = error.message.replace(/"/g, '""');
    return `${error.row},"${field}","${message}"`;
  });
  return header + lines.join("\n");
}
