import { describe, expect, test } from "bun:test";

import { ApiError } from "../src/errors/api-error";
import {
  applyImportFieldMapping,
  getImportSourceColumns,
} from "../src/services/import-mapping";

describe("import field mapping", () => {
  test("normalizes non-standard columns and excludes unmapped values", () => {
    const rows = [
      { 客户简称: "华东贸易", 采购邮箱: "buyer@example.com", 备注: "忽略" },
    ];
    const columns = getImportSourceColumns(rows);

    expect(columns).toEqual(["客户简称", "采购邮箱", "备注"]);
    expect(
      applyImportFieldMapping(
        rows,
        {
          name: "客户简称",
          email: "采购邮箱",
        },
        columns,
      ),
    ).toEqual([{ name: "华东贸易", email: "buyer@example.com" }]);
  });

  test("returns field-addressable validation errors for missing source columns", () => {
    try {
      applyImportFieldMapping([{ 客户简称: "华东贸易" }], {
        name: "不存在的列",
      });
      throw new Error("Expected mapping to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 400,
        code: "VALIDATION_ERROR",
        fields: { "mapping.name": expect.any(Array) },
      });
    }
  });
});
