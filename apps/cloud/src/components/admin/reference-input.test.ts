import { describe, expect, it } from "vitest";

import { getDefaultReferenceSort } from "./reference-input-sort";

describe("ReferenceInput default sorting", () => {
  it("uses the Customer cursor API name sort for company choices", () => {
    expect(getDefaultReferenceSort("companies")).toEqual({
      field: "name",
      order: "ASC",
    });
  });

  it("preserves explicit sorts and other resource defaults", () => {
    const explicitSort = { field: "updated_at", order: "DESC" } as const;

    expect(getDefaultReferenceSort("companies", explicitSort)).toBe(
      explicitSort,
    );
    expect(getDefaultReferenceSort("contacts")).toBeUndefined();
  });
});
