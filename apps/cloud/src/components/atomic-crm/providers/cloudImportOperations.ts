import {
  API_ERROR_CODES,
  ApiError,
  CustomerContactSchema,
  CustomerSchema,
  CustomerSocialAccountSchema,
  type ApiClient,
  type Customer,
  type CustomerContact,
  type CustomerSocialAccount,
} from "@dealpilot/api-client";
import {
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
  ImportFieldMappingSchema,
  ImportParseResponseSchema,
  normalizeEmail,
  normalizePhone,
  normalizePlatformIdentifier,
} from "@dealpilot/shared";
import Papa from "papaparse";
import * as XLSX from "xlsx";

import type {
  CustomerImportOperations,
  ImportFieldMapping,
  ImportParseResult,
} from "./importOperations";

const MAX_IMPORT_ROWS = 1_000;
const PAGE_SIZE = 1_000;
const MAX_CACHED_JOBS = 20;

type ImportRow = ImportParseResult["duplicate_candidates"][number]["incoming"];
type ImportError = ImportParseResult["errors"][number];
type Resolution = NonNullable<
  ReturnType<typeof ImportCommitRequestSchema.parse>["resolutions"]
>[number];

interface ParsedRow {
  rowIndex: number;
  raw: Record<string, unknown>;
  customer: ImportRow;
  valid: boolean;
}

interface ExistingState {
  customers: Customer[];
  contacts: CustomerContact[];
  socialAccounts: CustomerSocialAccount[];
}

interface CachedImport {
  rows: ParsedRow[];
  errors: ImportError[];
  duplicateTargets: Map<number, Set<string>>;
  existing: ExistingState;
}

type ImportClient = Pick<ApiClient, "list" | "imports">;

export function createCloudCustomerImportOperations(
  client: ImportClient,
): CustomerImportOperations {
  const jobs = new Map<string, CachedImport>();

  return {
    async parseFile(file, options) {
      assertNotAborted(options?.signal);
      const mapping = parseMapping(options?.mapping);
      const rawRows = await parseWorkbook(file, options?.signal);
      const sourceColumns = getSourceColumns(rawRows);
      const mappedRows = mapping
        ? applyMapping(rawRows, mapping, sourceColumns)
        : rawRows;
      const { rows, errors } = parseRows(mappedRows);
      assertNotAborted(options?.signal);

      const existing = await loadExistingState(client, options?.signal);
      const duplicateTargets = new Map<number, Set<string>>();
      const duplicateCandidates = [];
      const nameCompanyHints = [];

      for (const row of rows) {
        if (!row.valid) continue;
        const matches = findExactMatches(row.customer, existing);
        if (matches.length > 0) {
          duplicateTargets.set(
            row.rowIndex,
            new Set(matches.map((match) => match.existing_customer_id)),
          );
          duplicateCandidates.push({
            row_index: row.rowIndex,
            incoming: row.customer,
            matches,
          });
        }
        nameCompanyHints.push(
          ...findNameCompanyHints(
            row.rowIndex,
            row.customer,
            existing.customers,
          ),
        );
      }

      const jobId = crypto.randomUUID();
      cacheJob(jobs, jobId, {
        rows,
        errors,
        duplicateTargets,
        existing,
      });

      return ImportParseResponseSchema.parse({
        job_id: jobId,
        total_rows: rows.length,
        valid_rows: rows.filter((row) => row.valid).length,
        errors,
        duplicate_candidates: duplicateCandidates,
        name_company_hints: nameCompanyHints,
        source_columns: sourceColumns,
        preview: mappedRows.slice(0, 50),
      });
    },

    async commit(input, options) {
      const request = parseCommitRequest(input);
      assertNotAborted(options?.signal);
      const job = jobs.get(request.job_id);
      if (!job) {
        throw apiError(
          API_ERROR_CODES.notFound,
          "Import preview expired; parse the file again",
          404,
        );
      }

      const resolutions = validateResolutions(request.resolutions, job);
      const rows = job.rows
        .filter((row) => row.valid)
        .map((row) => ({ row_index: row.rowIndex, ...row.customer }));
      const resolutionList = Array.from(resolutions.values()).sort(
        (left, right) => left.row_index - right.row_index,
      );
      const invalidCount = job.rows.length - rows.length;
      const payloadHash = await hashImportPayload({
        rows,
        resolutions: resolutionList,
        invalidCount,
      });
      assertNotAborted(options?.signal);

      return ImportCommitResponseSchema.parse(
        await client.imports.commit(
          {
            jobId: request.job_id,
            idempotencyKey:
              options?.idempotencyKey?.trim() || request.job_id,
            payloadHash,
            rows,
            resolutions: resolutionList,
            invalidCount,
          },
          { signal: options?.signal },
        ),
      );
    },

    async downloadErrors(jobId, options) {
      const parsedJobId = parseJobId(jobId);
      assertNotAborted(options?.signal);
      const job = jobs.get(parsedJobId);
      if (!job) {
        throw apiError(
          API_ERROR_CODES.notFound,
          "Import preview expired; parse the file again",
          404,
        );
      }
      return new Blob([errorsToCsv(job.errors)], {
        type: "text/csv;charset=utf-8",
      });
    },
  };
}

async function parseWorkbook(
  file: File,
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    throw validationError({ file: ["仅支持 .xlsx、.xls 和 .csv 文件"] });
  }
  if (file.size === 0) {
    throw validationError({ file: ["导入文件不能为空"] });
  }

  try {
    let rows: Record<string, unknown>[];
    if (/\.csv$/i.test(file.name)) {
      const parsed = Papa.parse<Record<string, unknown>>(await file.text(), {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
      });
      if (parsed.errors.length > 0) {
        throw validationError({
          file: parsed.errors.map(
            (error) => `第 ${(error.row ?? 0) + 1} 行：${error.message}`,
          ),
        });
      }
      rows = parsed.data;
    } else {
      const buffer = await file.arrayBuffer();
      assertNotAborted(signal);
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = firstSheetName
        ? workbook.Sheets[firstSheetName]
        : undefined;
      if (!sheet) {
        throw validationError({ file: ["工作簿中没有可读取的工作表"] });
      }
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
        raw: false,
      });
    }
    assertNotAborted(signal);
    rows = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key.replace(/^\uFEFF/, ""),
          value,
        ]),
      ),
    );
    if (rows.length === 0) {
      throw validationError({ file: ["文件中没有可导入的数据行"] });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      throw validationError({
        file: [`单次最多导入 ${MAX_IMPORT_ROWS} 行，当前为 ${rows.length} 行`],
      });
    }
    return rows;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted) {
      throw apiError(API_ERROR_CODES.aborted, "Import parsing was aborted");
    }
    throw new ApiError({
      code: API_ERROR_CODES.validation,
      message: "Unable to parse import file",
      status: 400,
      fields: { file: ["文件格式无效或内容已损坏"] },
      cause: error,
    });
  }
}

function parseRows(rawRows: Record<string, unknown>[]) {
  const errors: ImportError[] = [];
  const rows = rawRows.map((raw, index): ParsedRow => {
    const rowIndex = index + 1;
    const customer = toImportRow(raw);
    let valid = true;
    if (!customer.name) {
      errors.push({
        row: rowIndex,
        field: "name",
        message: "客户名称不能为空",
      });
      valid = false;
    }
    if (!["A", "B", "C"].includes(customer.grade)) {
      errors.push({
        row: rowIndex,
        field: "grade",
        message: `无效的客户分级：${customer.grade}`,
      });
      valid = false;
    }
    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      errors.push({ row: rowIndex, field: "email", message: "邮箱格式无效" });
      valid = false;
    }
    if (Boolean(customer.platform) !== Boolean(customer.platform_account)) {
      errors.push({
        row: rowIndex,
        field: customer.platform ? "platform_account" : "platform",
        message: "平台和平台账号必须同时填写",
      });
      valid = false;
    }
    return { rowIndex, raw, customer, valid };
  });

  const identityRows = new Map<string, number>();
  for (const row of rows) {
    if (!row.valid) continue;
    for (const [field, identity] of importIdentities(row.customer)) {
      const previous = identityRows.get(identity);
      if (previous !== undefined) {
        errors.push({
          row: row.rowIndex,
          field,
          message: `与文件第 ${previous} 行使用了相同的${identityLabel(field)}`,
        });
        row.valid = false;
      } else {
        identityRows.set(identity, row.rowIndex);
      }
    }
  }
  return { rows, errors };
}

function toImportRow(raw: Record<string, unknown>): ImportRow {
  const grade = value(raw, "grade", "分级")?.toUpperCase() ?? "B";
  const platform = value(raw, "platform", "平台")?.toLocaleLowerCase() ?? null;
  return {
    name: value(raw, "name", "名称", "客户名称") ?? "",
    company: value(raw, "company", "公司") ?? null,
    country: value(raw, "country", "国家") ?? null,
    source: value(raw, "source", "来源") ?? null,
    grade: grade as "A" | "B" | "C",
    contact_name: value(raw, "contact_name", "联系人") ?? null,
    email: normalizeEmail(value(raw, "email", "邮箱")),
    phone: normalizePhone(value(raw, "phone", "电话", "手机")),
    platform,
    platform_account:
      value(raw, "platform_account", "平台账号", "社媒账号") ?? null,
  };
}

async function loadExistingState(
  client: ImportClient,
  signal?: AbortSignal,
): Promise<ExistingState> {
  const [customers, contacts, socialAccounts] = await Promise.all([
    listAll<Customer>(client, "companies", CustomerSchema, signal, {
      deleted_at: { operator: "is", value: null },
    }),
    listAll<CustomerContact>(client, "contacts", CustomerContactSchema, signal),
    listAll<CustomerSocialAccount>(
      client,
      "social_accounts",
      CustomerSocialAccountSchema,
      signal,
    ),
  ]);
  return { customers, contacts, socialAccounts };
}

async function listAll<T>(
  client: ImportClient,
  resource: string,
  schema: Parameters<ImportClient["list"]>[1],
  signal?: AbortSignal,
  filters?: Parameters<ImportClient["list"]>[2] extends infer Options
    ? Options extends { filters?: infer Filters }
      ? Filters
      : never
    : never,
): Promise<T[]> {
  const records: T[] = [];
  let page = 1;
  while (true) {
    const result = await client.list<T>(resource, schema as never, {
      signal,
      filters: filters as never,
      pagination: { page, perPage: PAGE_SIZE },
    });
    records.push(...result.data);
    if (records.length >= result.total || result.data.length < PAGE_SIZE) break;
    page += 1;
  }
  return records;
}

function findExactMatches(row: ImportRow, state: ExistingState) {
  const reasonsByCustomer = new Map<
    string,
    Set<"email" | "phone" | "platform_account">
  >();
  const add = (
    customerId: string,
    reason: "email" | "phone" | "platform_account",
  ) => {
    const reasons = reasonsByCustomer.get(customerId) ?? new Set();
    reasons.add(reason);
    reasonsByCustomer.set(customerId, reasons);
  };

  for (const contact of state.contacts) {
    if (
      row.email &&
      contact.email_jsonb.some(
        (item) =>
          isRecord(item) && normalizeEmail(text(item.email)) === row.email,
      )
    ) {
      add(contact.company_id, "email");
    }
    if (
      row.phone &&
      contact.phone_jsonb.some(
        (item) =>
          isRecord(item) && normalizePhone(text(item.number)) === row.phone,
      )
    ) {
      add(contact.company_id, "phone");
    }
  }
  if (row.platform && row.platform_account) {
    const normalized = normalizePlatformIdentifier(
      row.platform,
      row.platform_account,
    );
    for (const account of state.socialAccounts) {
      if (
        account.platform.toLocaleLowerCase() === row.platform &&
        account.normalized_identifier === normalized
      ) {
        add(account.company_id, "platform_account");
      }
    }
  }

  return Array.from(reasonsByCustomer, ([customerId, reasons]) => {
    const customer = state.customers.find(({ id }) => id === customerId);
    if (!customer) return null;
    const contact = state.contacts.find(
      (candidate) => candidate.company_id === customerId,
    );
    const account = state.socialAccounts.find(
      (candidate) => candidate.company_id === customerId,
    );
    const existing = existingSnapshot(customer, contact, account);
    return {
      existing_customer_id: customer.id,
      matched_by: Array.from(reasons),
      existing,
      conflicts: fieldConflicts(existing, row),
    };
  }).filter((match): match is NonNullable<typeof match> => match !== null);
}

function existingSnapshot(
  customer: Customer,
  contact?: CustomerContact,
  account?: CustomerSocialAccount,
) {
  return {
    customer_id: customer.id,
    name: customer.name,
    company: customer.company,
    country: customer.country,
    source: customer.source,
    grade: customer.grade,
    contact_name: contact?.name ?? null,
    email: firstContactValue(contact?.email_jsonb, "email", normalizeEmail),
    phone: firstContactValue(contact?.phone_jsonb, "number", normalizePhone),
    platform: account?.platform ?? null,
    platform_account: account?.raw_identifier ?? null,
  };
}

function fieldConflicts(
  existing: ReturnType<typeof existingSnapshot>,
  incoming: ImportRow,
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
    const current = existing[field];
    const next = incoming[field];
    return current && next && current !== next
      ? [{ field, existing_value: current, incoming_value: next }]
      : [];
  });
}

function findNameCompanyHints(
  rowIndex: number,
  incoming: ImportRow,
  customers: Customer[],
) {
  const incomingName = incoming.name.toLocaleLowerCase();
  const incomingCompany = incoming.company?.toLocaleLowerCase();
  return customers.flatMap((customer) => {
    const matchedBy: Array<"name" | "company"> = [];
    if (customer.name.toLocaleLowerCase() === incomingName)
      matchedBy.push("name");
    if (
      incomingCompany &&
      customer.company?.toLocaleLowerCase() === incomingCompany
    ) {
      matchedBy.push("company");
    }
    return matchedBy.length
      ? [
          {
            row_index: rowIndex,
            existing_customer_id: customer.id,
            matched_by: matchedBy,
            existing_name: customer.name,
            existing_company: customer.company,
            incoming_name: incoming.name,
            incoming_company: incoming.company,
          },
        ]
      : [];
  });
}

function validateResolutions(
  requestResolutions: Resolution[],
  job: CachedImport,
) {
  const resolutions = new Map(
    requestResolutions.map((resolution) => [resolution.row_index, resolution]),
  );
  for (const resolution of requestResolutions) {
    const candidates = job.duplicateTargets.get(resolution.row_index);
    if (!candidates) {
      throw validationError({
        resolutions: [`第 ${resolution.row_index} 行不是重复候选`],
      });
    }
    if (
      resolution.action === "merge" &&
      !candidates.has(resolution.target_customer_id!)
    ) {
      throw validationError({
        resolutions: [`第 ${resolution.row_index} 行的合并目标不在预览候选中`],
      });
    }
  }
  for (const rowIndex of job.duplicateTargets.keys()) {
    if (!resolutions.has(rowIndex)) {
      throw validationError({
        resolutions: [`第 ${rowIndex} 行必须明确选择合并、跳过或新建`],
      });
    }
  }
  return resolutions;
}

function parseMapping(mapping: ImportFieldMapping | undefined) {
  if (mapping === undefined) return undefined;
  const result = ImportFieldMappingSchema.safeParse(mapping);
  if (result.success) return result.data;
  throw zodValidationError(result.error);
}

function parseCommitRequest(input: unknown) {
  const result = ImportCommitRequestSchema.safeParse(input);
  if (result.success) return result.data;
  throw zodValidationError(result.error);
}

function parseJobId(input: unknown) {
  const result = ImportCommitRequestSchema.shape.job_id.safeParse(input);
  if (result.success) return result.data;
  throw zodValidationError(result.error);
}

function applyMapping(
  rows: Record<string, unknown>[],
  mapping: ImportFieldMapping,
  sourceColumns: string[],
) {
  const sourceSet = new Set(sourceColumns);
  const missing = Object.entries(mapping).filter(
    ([, source]) => source && !sourceSet.has(source),
  );
  if (missing.length > 0) {
    throw validationError(
      Object.fromEntries(
        missing.map(([target, source]) => [
          `mapping.${target}`,
          [`源列“${source}”不存在`],
        ]),
      ),
    );
  }
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(mapping).flatMap(([target, source]) =>
        source ? [[target, row[source]]] : [],
      ),
    ),
  );
}

function getSourceColumns(rows: Record<string, unknown>[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function value(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const current = row[key];
    if (current === null || current === undefined) continue;
    const normalized = String(current).trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function firstContactValue(
  values: CustomerContact["email_jsonb"] | undefined,
  field: string,
  normalize: (value: string | null | undefined) => string | null,
) {
  for (const item of values ?? []) {
    if (!isRecord(item)) continue;
    const result = normalize(text(item[field]));
    if (result) return result;
  }
  return null;
}

function importIdentities(row: ImportRow): Array<[string, string]> {
  return [
    ...(row.email ? [["email", `email:${row.email}`] as [string, string]] : []),
    ...(row.phone ? [["phone", `phone:${row.phone}`] as [string, string]] : []),
    ...(row.platform && row.platform_account
      ? [
          [
            "platform_account",
            `platform:${row.platform}:${normalizePlatformIdentifier(
              row.platform,
              row.platform_account,
            )}`,
          ] as [string, string],
        ]
      : []),
  ];
}

function identityLabel(field: string) {
  return (
    { email: "邮箱", phone: "电话", platform_account: "平台账号" }[field] ??
    "唯一标识"
  );
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorsToCsv(errors: ImportError[]) {
  const escape = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFFrow,field,message\n${errors
    .map((error) =>
      [error.row, error.field ?? "", error.message].map(escape).join(","),
    )
    .join("\n")}`;
}

function cacheJob(
  jobs: Map<string, CachedImport>,
  jobId: string,
  job: CachedImport,
) {
  jobs.set(jobId, job);
  while (jobs.size > MAX_CACHED_JOBS) {
    const oldest = jobs.keys().next().value;
    if (!oldest) break;
    jobs.delete(oldest);
  }
}

async function hashImportPayload(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw apiError(API_ERROR_CODES.aborted, "Import request was aborted");
  }
}

function zodValidationError(error: {
  issues: ReadonlyArray<{ path: Array<string | number>; message: string }>;
}) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "request";
    (fields[field] ??= []).push(issue.message);
  }
  return validationError(fields, error.issues);
}

function validationError(fields: Record<string, string[]>, details?: unknown) {
  return new ApiError({
    code: API_ERROR_CODES.validation,
    message: "Invalid cloud import request",
    status: 400,
    fields,
    details,
  });
}

function apiError(code: string, message: string, status = 0) {
  return new ApiError({ code, message, status });
}
