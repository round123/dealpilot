import { describe, expect, test } from "bun:test";

import {
  ImportFieldMappingSchema,
  ImportParseRequestSchema,
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
});
