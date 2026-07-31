import {
  ApiError,
  CustomerContactSchema,
  CustomerSchema,
  CustomerSocialAccountSchema,
  type ApiClient,
} from "@dealpilot/api-client";
import { describe, expect, it, vi } from "vitest";

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
  let sequence = 4;
  const customers = withExisting ? [existingCustomer] : [];
  const contacts = withExisting ? [existingContact] : [];
  const socialAccounts: ReturnType<typeof CustomerSocialAccountSchema.parse>[] =
    [];

  const list = vi.fn(async (resource: string) => {
    const data =
      resource === "companies"
        ? customers
        : resource === "contacts"
          ? contacts
          : socialAccounts;
    return { data, total: data.length };
  });
  const create = vi.fn(async (resource: string, input: Record<string, any>) => {
    sequence += 1;
    const id = `${String(sequence).padStart(8, "0")}-0000-4000-8000-${String(
      sequence,
    ).padStart(12, "0")}`;
    if (resource === "companies") {
      const result = CustomerSchema.parse({
        ...existingCustomer,
        ...input,
        id,
        company: input.company ?? null,
        country: input.country ?? null,
        source: input.source ?? null,
      });
      customers.push(result);
      return result;
    }
    if (resource === "contacts") {
      const result = CustomerContactSchema.parse({
        ...existingContact,
        ...input,
        id,
        owner_user_id: userId,
      });
      contacts.push(result);
      return result;
    }
    const result = CustomerSocialAccountSchema.parse({
      ...input,
      id,
      owner_user_id: userId,
      created_at: now,
      updated_at: now,
    });
    socialAccounts.push(result);
    return result;
  });
  const update = vi.fn(async () => existingCustomer);
  return {
    client: { list, create, update } as unknown as ApiClient,
    list,
    create,
    update,
  };
}

describe("cloud customer import operations", () => {
  it("maps CSV columns, previews duplicate candidates, and writes through the API client", async () => {
    const { client, list, create } = createClient();
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
    expect(create).toHaveBeenCalledWith(
      "companies",
      expect.objectContaining({
        name: "华东贸易新记录",
        country: "中国",
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(create).toHaveBeenCalledWith(
      "contacts",
      expect.objectContaining({
        email_jsonb: [{ email: "buyer@example.com", type: "Work" }],
      }),
      expect.anything(),
      expect.anything(),
    );

    const callCount = create.mock.calls.length;
    await expect(
      operations.commit(request, { idempotencyKey: "customer-import-1" }),
    ).resolves.toEqual(result);
    expect(create).toHaveBeenCalledTimes(callCount);
  });

  it("reports invalid and repeated identities per row and exports a CSV report", async () => {
    const { client, create } = createClient(false);
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
    expect(create).toHaveBeenCalled();
  });

  it("does not copy an identity already present on a merge target", async () => {
    const { client, create } = createClient();
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

    expect(create).toHaveBeenCalledWith(
      "contacts",
      expect.objectContaining({
        email_jsonb: [],
        phone_jsonb: [{ number: "+8613800000000", type: "Work" }],
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("adds a stable row error when a cloud write fails", async () => {
    const { client, create } = createClient(false);
    create.mockRejectedValueOnce(
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
    ).resolves.toMatchObject({ success: 0, failed: 1 });
    const report = await operations.downloadErrors(preview.job_id);
    const csv = await report.text();
    expect(csv).toContain("云端数据发生冲突，请刷新客户数据后重新导入");
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
