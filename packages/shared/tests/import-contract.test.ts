import { describe, expect, test } from "bun:test";

import {
  ImportFieldMappingSchema,
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
  ImportParseRequestSchema,
  ImportParseResponseSchema,
} from "../src/index";

describe("import field mapping contract", () => {
  test("accepts strict target-to-source mappings", () => {
    expect(
      ImportParseRequestSchema.parse({
        mapping: {
          name: "客户简称",
          email: "采购邮箱",
          grade: "等级说明",
        },
      }),
    ).toEqual({
      mapping: {
        name: "客户简称",
        email: "采购邮箱",
        grade: "等级说明",
      },
    });
  });

  test("requires customer name and rejects duplicate source columns", () => {
    expect(
      ImportFieldMappingSchema.safeParse({ email: "邮箱列" }).success,
    ).toBe(false);

    const duplicate = ImportFieldMappingSchema.safeParse({
      name: "客户列",
      company: "客户列",
    });
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error.issues[0]?.path).toEqual(["company"]);
    }
  });

  test("rejects unknown target fields", () => {
    expect(
      ImportFieldMappingSchema.safeParse({
        name: "客户列",
        unsupported: "备注列",
      }).success,
    ).toBe(false);
  });

  test("requires an explicit target for merge resolutions", () => {
    const parsed = ImportCommitRequestSchema.safeParse({
      job_id: "11111111-1111-4111-8111-111111111111",
      resolutions: [{ row_index: 1, action: "merge" }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual([
        "resolutions",
        0,
        "target_customer_id",
      ]);
    }
  });

  test("rejects duplicate or non-positive resolution row indexes", () => {
    const duplicate = ImportCommitRequestSchema.safeParse({
      job_id: "11111111-1111-4111-8111-111111111111",
      resolutions: [
        { row_index: 1, action: "skip" },
        { row_index: 1, action: "new" },
      ],
    });
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error.issues[0]?.path).toEqual([
        "resolutions",
        1,
        "row_index",
      ]);
    }

    expect(
      ImportCommitRequestSchema.safeParse({
        job_id: "11111111-1111-4111-8111-111111111111",
        resolutions: [{ row_index: 0, action: "skip" }],
      }).success,
    ).toBe(false);
  });

  test("parses duplicate evidence, field conflicts and name-only hints", () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    const customerId = "22222222-2222-4222-8222-222222222222";
    const snapshot = {
      name: "导入客户",
      company: "贸易公司",
      country: null,
      source: null,
      grade: "B" as const,
      contact_name: "采购经理",
      email: "buyer@example.com",
      phone: "+8613800138000",
      platform: "telegram",
      platform_account: "@buyer",
    };
    const parsed = ImportParseResponseSchema.parse({
      job_id: jobId,
      total_rows: 1,
      valid_rows: 1,
      errors: [],
      duplicate_candidates: [
        {
          row_index: 1,
          incoming: snapshot,
          matches: [
            {
              existing_customer_id: customerId,
              matched_by: ["email", "phone", "platform_account"],
              existing: {
                ...snapshot,
                customer_id: customerId,
                name: "现有客户",
              },
              conflicts: [
                {
                  field: "name",
                  existing_value: "现有客户",
                  incoming_value: "导入客户",
                },
              ],
            },
          ],
        },
      ],
      name_company_hints: [
        {
          row_index: 1,
          existing_customer_id: customerId,
          matched_by: ["company"],
          existing_name: "现有客户",
          existing_company: "贸易公司",
          incoming_name: "导入客户",
          incoming_company: "贸易公司",
        },
      ],
      source_columns: [],
      preview: [],
    });

    expect(parsed.duplicate_candidates[0]?.matches[0]?.matched_by).toEqual([
      "email",
      "phone",
      "platform_account",
    ]);
    expect(parsed.name_company_hints[0]?.matched_by).toEqual(["company"]);
  });

  test("parses a structured warning when a unique platform account is not copied", () => {
    const parsed = ImportCommitResponseSchema.parse({
      success: 1,
      failed: 0,
      skipped: 0,
      duplicates: 0,
      warnings: [
        {
          code: "PLATFORM_ACCOUNT_NOT_COPIED",
          row_index: 3,
          field: "platform_account",
          platform: "telegram",
          platform_account: "@buyer",
          existing_customer_id: "22222222-2222-4222-8222-222222222222",
        },
      ],
    });
    expect(parsed.warnings[0]?.code).toBe("PLATFORM_ACCOUNT_NOT_COPIED");
  });
});
