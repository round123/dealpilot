import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  normalizeEmail,
  normalizePhone,
  normalizePlatformIdentifier,
} from "@dealpilot/shared";
import type { ImportCommitRequest } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  commitImportRows,
  findImportCandidates,
  findImportJob,
  ImportMergeTargetUnavailableError,
  ImportPreviewStaleError,
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
  candidateTargets: Map<number, Set<string>>;
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
): Omit<
  ImportCustomerRow,
  "action" | "targetCustomerId" | "allowDuplicate" | "rowIndex"
> {
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
    platform: value(row.data, "platform", "平台")?.toLowerCase() ?? null,
    platformAccount:
      value(row.data, "platform_account", "平台账号", "社媒账号") ?? null,
    normalizedPlatformAccount: null,
  };
}

function normalizeCustomerRow(
  row: ReturnType<typeof toCustomerRow>,
): ReturnType<typeof toCustomerRow> {
  return {
    ...row,
    normalizedPlatformAccount:
      row.platform && row.platformAccount
        ? normalizePlatformIdentifier(row.platform, row.platformAccount)
        : null,
  };
}

function toSnapshot(row: ReturnType<typeof toCustomerRow>) {
  return {
    name: row.name,
    company: row.company,
    country: row.country,
    source: row.source,
    grade: row.grade,
    contact_name: row.contactName,
    email: row.email,
    phone: row.phone,
    platform: row.platform,
    platform_account: row.platformAccount,
  };
}

function fieldConflicts(
  existing: ReturnType<typeof toSnapshot> & { customer_id?: string },
  incoming: ReturnType<typeof toSnapshot>,
) {
  const fields = [
    "name",
    "company",
    "country",
    "source",
    "grade",
    "contact_name",
    "email",
    "phone",
    "platform",
    "platform_account",
  ] as const;
  return fields.flatMap((field) => {
    const existingValue = existing[field];
    const incomingValue = incoming[field];
    const valuesMatch =
      field === "email"
        ? existingValue?.toLowerCase() === incomingValue?.toLowerCase()
        : field === "platform_account" && existing.platform && incoming.platform
          ? normalizePlatformIdentifier(
              existing.platform,
              existingValue ?? "",
            ) ===
            normalizePlatformIdentifier(incoming.platform, incomingValue ?? "")
          : existingValue === incomingValue;
    return existingValue && incomingValue && !valuesMatch
      ? [
          {
            field,
            existing_value: existingValue,
            incoming_value: incomingValue,
          },
        ]
      : [];
  });
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
    const platform = value(data, "platform", "平台");
    const platformAccount = value(
      data,
      "platform_account",
      "平台账号",
      "社媒账号",
    );
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
    if (Boolean(platform) !== Boolean(platformAccount)) {
      errors.push({
        row: rowIndex,
        field: platform ? "platform_account" : "platform",
        message: "平台和平台账号必须同时填写",
      });
      return { rowIndex, data, valid: false };
    }
    return { rowIndex, data, valid: true };
  });

  const duplicateCandidates = [];
  const nameCompanyHints = [];
  const duplicateRows = new Set<number>();
  const candidateTargets = new Map<number, Set<string>>();
  for (const row of parsedRows) {
    if (!row.valid) continue;
    const customer = normalizeCustomerRow(toCustomerRow(row));
    const candidates = await findImportCandidates({
      ...customer,
      rowIndex: row.rowIndex,
      action: "create",
      allowDuplicate: false,
    });
    for (const hint of candidates.hints) {
      nameCompanyHints.push({
        row_index: row.rowIndex,
        existing_customer_id: hint.customerId,
        matched_by: hint.matchedBy,
        existing_name: hint.name,
        existing_company: hint.company,
        incoming_name: customer.name,
        incoming_company: customer.company,
      });
    }
    if (candidates.exact.length === 0) continue;
    duplicateRows.add(row.rowIndex);
    candidateTargets.set(
      row.rowIndex,
      new Set(candidates.exact.map(({ customer }) => customer.customer_id)),
    );
    const incoming = toSnapshot(customer);
    duplicateCandidates.push({
      row_index: row.rowIndex,
      incoming,
      matches: candidates.exact.map((candidate) => ({
        existing_customer_id: candidate.customer.customer_id,
        matched_by: candidate.matchedBy,
        existing: candidate.customer,
        conflicts: fieldConflicts(candidate.customer, incoming),
      })),
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
  parsedResultsCache.set(jobId, {
    rows: parsedRows,
    duplicateRows,
    candidateTargets,
    job,
  });
  errorReportCache.set(jobId, errors);

  return {
    job_id: jobId,
    total_rows: rows.length,
    valid_rows: validRows,
    errors,
    duplicate_candidates: duplicateCandidates,
    name_company_hints: nameCompanyHints,
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
  for (const resolution of request.resolutions ?? []) {
    if (!cached.duplicateRows.has(resolution.row_index)) {
      throw ApiError.badRequest(
        `Resolution row ${resolution.row_index} is not a duplicate candidate`,
      );
    }
  }
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
    if (
      resolution?.action === "merge" &&
      !cached.candidateTargets
        .get(row.rowIndex)
        ?.has(resolution.target_customer_id!)
    ) {
      throw ApiError.badRequest(
        `Merge target for row ${row.rowIndex} is not one of its duplicate candidates`,
      );
    }
    return {
      ...normalizeCustomerRow(toCustomerRow(row)),
      rowIndex: row.rowIndex,
      action: !row.valid
        ? "skip"
        : resolution?.action === "merge"
          ? "merge"
          : resolution?.action === "skip"
            ? "skip"
            : "create",
      targetCustomerId: resolution?.target_customer_id,
      allowDuplicate: resolution?.action === "new",
    };
  });

  let result;
  try {
    result = await commitImportRows(request.job_id, rows, cached.job);
  } catch (error) {
    if (
      error instanceof ImportMergeTargetUnavailableError ||
      error instanceof ImportPreviewStaleError
    ) {
      throw ApiError.conflict(
        "The selected merge target changed after preview; parse the file again",
      );
    }
    throw error;
  }
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
