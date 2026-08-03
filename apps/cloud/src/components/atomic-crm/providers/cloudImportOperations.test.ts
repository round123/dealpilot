import {
  ApiError,
  CustomerContactSchema,
  CustomerSchema,
  type ApiClient,
  type CustomerSocialAccount,
} from "@dealpilot/api-client";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { createCloudCustomerImportOperations } from "./cloudImportOperations";

const now = "2026-07-31T08:00:00.000Z";
const existingCustomerId = "11111111-1111-4111-8111-111111111111";
const existingContactId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

const existingCustomer = CustomerSchema.parse({
  id: existingCustomerId,
  owner_user_id: userId,
  name: "华东贸易",
  company: "华东贸易有限公司",
  sector: null,
  size: null,
  linkedin_url: null,
  website: null,
  phone_number: null,
  address: null,
  zipcode: null,
  city: null,
  state_abbr: null,
  country: "中国",
  description: null,
  revenue: null,
  tax_identifier: null,
  logo: null,
  context_links: [],
  source: null,
  grade: "B",
  status: "active",
  deleted_at: null,
  created_at: now,
  updated_at: now,
});

const existingContact = CustomerContactSchema.parse({
  id: existingContactId,
  owner_user_id: userId,
  company_id: existingCustomerId,
  first_name: null,
  last_name: null,
  name: "采购负责人",
  gender: null,
  title: null,
  background: null,
  avatar: null,
  first_seen: null,
  last_seen: null,
  has_newsletter: false,
  status: null,
  linkedin_url: null,
  email_jsonb: [{ email: "buyer@example.com", type: "Work" }],
  phone_jsonb: [],
  created_at: now,
  updated_at: now,
});

function createClient(withExisting = true) {
  const customers = withExisting ? [existingCustomer] : [];
  const contacts = withExisting ? [existingContact] : [];
  const socialAccounts: CustomerSocialAccount[] = [];

  const list = vi.fn(async (resource: string) => {
    const data =
      resource === "companies"
        ? customers
        : resource === "contacts"
          ? contacts
          : socialAccounts;
    return { data, total: data.length };
  });
  const results = new Map<
    string,
    {
      success: number;
      failed: number;
      skipped: number;
      duplicates: number;
      warnings: never[];
    }
  >();
  async function commit(input: {
    idempotencyKey: string;
    rows: Array<{ row_index: number }>;
    resolutions: Array<{ action: "merge" | "skip" | "new" }>;
    invalidCount: number;
  }) {
    const replay = results.get(input.idempotencyKey);
    if (replay) return replay;
    const result = {
      success:
        input.rows.length -
        input.resolutions.filter(({ action }) => action !== "new").length,
      failed: input.invalidCount,
      skipped: input.resolutions.filter(({ action }) => action === "skip")
        .length,
      duplicates: input.resolutions.filter(({ action }) => action === "merge")
        .length,
      warnings: [],
    };
    results.set(input.idempotencyKey, result);
    return result;
  }
  const commitMock = vi.fn(commit);
  return {
    client: { list, imports: { commit: commitMock } } as unknown as ApiClient,
    list,
    commit: commitMock,
  };
}

describe("cloud customer import operations", () => {
  it.each(["csv", "xlsx"] as const)(
    "parses and commits the 1000-row %s Cloud path",
    async (format) => {
      const { client, commit } = createClient(false);
      const operations = createCloudCustomerImportOperations(client);
      const file = createScaleImportFile(format);
      const startedAt = performance.now();

      const preview = await operations.parseFile(file);
      expect(preview).toMatchObject({ total_rows: 1_000, valid_rows: 1_000 });
      const result = await operations.commit({
        job_id: preview.job_id,
        resolutions: [],
      });

      expect(result).toMatchObject({ success: 1_000, failed: 0 });
      expect(commit).toHaveBeenCalledWith(
        expect.objectContaining({
          rows: expect.arrayContaining([
            expect.objectContaining({ row_index: 1, name: "规模客户 1" }),
            expect.objectContaining({
              row_index: 1_000,
              name: "规模客户 1000",
            }),
          ]),
          invalidCount: 0,
        }),
        expect.anything(),
      );
      expect(commit.mock.calls[0]?.[0].rows).toHaveLength(1_000);
      expect(performance.now() - startedAt).toBeLessThan(30_000);
    },
    35_000,
  );

  it("maps CSV columns, previews duplicate candidates, and commits one RPC payload", async () => {
    const { client, list, commit } = createClient();
    const operations = createCloudCustomerImportOperations(client);
    const file = new File(
      [
        "客户简称,采购邮箱,所在国家\n",
        "华东贸易新记录,buyer@example.com,中国\n",
      ],
      "客户.csv",
      { type: "text/csv" },
    );

    const firstPreview = await operations.parseFile(file);
    expect(firstPreview.source_columns).toEqual([
      "客户简称",
      "采购邮箱",
      "所在国家",
    ]);
    expect(firstPreview.valid_rows).toBe(0);

    const preview = await operations.parseFile(file, {
      mapping: {
        name: "客户简称",
        email: "采购邮箱",
        country: "所在国家",
      },
    });
    expect(preview).toMatchObject({
      total_rows: 1,
      valid_rows: 1,
      errors: [],
    });
    expect(preview.duplicate_candidates[0]).toMatchObject({
      row_index: 1,
      incoming: { name: "华东贸易新记录", email: "buyer@example.com" },
      matches: [
        {
          existing_customer_id: existingCustomerId,
          matched_by: ["email"],
        },
      ],
    });
    expect(list).toHaveBeenCalledWith(
      "companies",
      expect.anything(),
      expect.objectContaining({ pagination: { page: 1, perPage: 1000 } }),
    );

    const request = {
      job_id: preview.job_id,
      resolutions: [{ row_index: 1, action: "new" as const }],
    };
    const result = await operations.commit(request, {
      idempotencyKey: "customer-import-1",
    });
    expect(result).toEqual({
      success: 1,
      failed: 0,
      skipped: 0,
      duplicates: 0,
      warnings: [],
    });
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: preview.job_id,
        idempotencyKey: "customer-import-1",
        payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        rows: [
          expect.objectContaining({
            row_index: 1,
            name: "华东贸易新记录",
            country: "中国",
            email: "buyer@example.com",
          }),
        ],
        resolutions: request.resolutions,
        invalidCount: 0,
      }),
      { signal: undefined },
    );

    await expect(
      operations.commit(request, { idempotencyKey: "customer-import-1" }),
    ).resolves.toEqual(result);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("reports invalid and repeated identities per row and exports a CSV report", async () => {
    const { client, commit } = createClient(false);
    const operations = createCloudCustomerImportOperations(client);
    const file = new File(
      [
        "名称,邮箱,分级\n",
        "第一条,same@example.com,A\n",
        "第二条,same@example.com,B\n",
        ",broken-email,D\n",
      ],
      "客户.xlsx.csv",
      { type: "text/csv" },
    );

    const preview = await operations.parseFile(file);
    expect(preview.valid_rows).toBe(1);
    expect(preview.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: "email" }),
        expect.objectContaining({ row: 3, field: "name" }),
        expect.objectContaining({ row: 3, field: "grade" }),
        expect.objectContaining({ row: 3, field: "email" }),
      ]),
    );

    const report = await operations.downloadErrors(preview.job_id);
    const csv = await report.text();
    expect(report.type).toBe("text/csv;charset=utf-8");
    expect(csv).toContain("row,field,message");
    expect(csv).toContain('"2","email"');

    const result = await operations.commit({
      job_id: preview.job_id,
      resolutions: [],
    });
    expect(result).toMatchObject({ success: 1, failed: 2 });
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ invalidCount: 2, rows: [expect.anything()] }),
      expect.anything(),
    );
  });

  it("sends the merge resolution and row identities to PostgreSQL", async () => {
    const { client, commit } = createClient();
    const operations = createCloudCustomerImportOperations(client);
    const preview = await operations.parseFile(
      new File(
        ["名称,邮箱,电话\n合并记录,buyer@example.com,+8613800000000"],
        "客户.csv",
      ),
    );

    await operations.commit({
      job_id: preview.job_id,
      resolutions: [
        {
          row_index: 1,
          action: "merge",
          target_customer_id: existingCustomerId,
        },
      ],
    });

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            email: "buyer@example.com",
            phone: "+8613800000000",
          }),
        ],
        resolutions: [
          {
            row_index: 1,
            action: "merge",
            target_customer_id: existingCustomerId,
          },
        ],
      }),
      expect.anything(),
    );
  });

  it("propagates a transactional RPC failure instead of reporting partial success", async () => {
    const { client, commit } = createClient(false);
    commit.mockRejectedValueOnce(
      new ApiError({
        code: "CONFLICT",
        status: 409,
        message: "duplicate key value contains private backend detail",
      }),
    );
    const operations = createCloudCustomerImportOperations(client);
    const preview = await operations.parseFile(
      new File(["名称,来源\n失败客户,测试"], "客户.csv"),
    );

    await expect(
      operations.commit({ job_id: preview.job_id, resolutions: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const report = await operations.downloadErrors(preview.job_id);
    const csv = await report.text();
    expect(csv).not.toContain("云端数据发生冲突");
    expect(csv).not.toContain("private backend detail");
  });

  it("honors cancellation before parsing or network access", async () => {
    const { client, list } = createClient();
    const operations = createCloudCustomerImportOperations(client);
    const controller = new AbortController();
    controller.abort();

    await expect(
      operations.parseFile(new File(["名称\n客户"], "客户.csv"), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(list).not.toHaveBeenCalled();
  });
});

function createScaleImportFile(format: "csv" | "xlsx") {
  const rows = Array.from({ length: 1_000 }, (_, index) => [
    `规模客户 ${index + 1}`,
    index % 2 === 0 ? "中国" : "新加坡",
    "批量导入验收",
  ]);
  if (format === "csv") {
    return new File(
      [
        [["名称", "国家", "来源"], ...rows]
          .map((row) => row.join(","))
          .join("\n"),
      ],
      "cloud-scale-1000.csv",
      { type: "text/csv" },
    );
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["名称", "国家", "来源"], ...rows]),
    "客户",
  );
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new File([bytes], "cloud-scale-1000.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
