import { describe, it, expect } from "vitest";
import type { RaRecord } from "ra-core";
import { validateItemsInUse } from "./SettingsPage";

describe("validateItemsInUse", () => {
  const deals: RaRecord[] = [
    { id: 1, stage: "closed_won", category: "ui-design" },
    { id: 2, stage: "closed_lost", category: "copywriting" },
    { id: 3, stage: "lead", category: "ui-design" },
  ];

  it("returns undefined when items is undefined", () => {
    expect(validateItemsInUse(undefined, deals, "stage", "stages")).toBe(
      undefined,
    );
  });

  it("returns undefined when all in-use values are present", () => {
    const items = [
      { value: "closed_won", label: "Closed won" },
      { value: "closed_lost", label: "Closed lost" },
      { value: "lead", label: "Lead" },
    ];
    expect(validateItemsInUse(items, deals, "stage", "stages")).toBe(undefined);
  });

  it("returns an error when an in-use value is removed", () => {
    const items = [
      { value: "closed_won", label: "Closed won" },
      { value: "lead", label: "Lead" },
    ];
    expect(validateItemsInUse(items, deals, "stage", "stages")).toBe(
      "Cannot remove stages that are still used by deals: closed_lost",
    );
  });

  it("lists all missing in-use values", () => {
    const items = [{ value: "lead", label: "Lead" }];
    const result = validateItemsInUse(items, deals, "stage", "stages");
    expect(result).toContain("closed_won");
    expect(result).toContain("closed_lost");
  });

  it("returns an error when there are duplicate slugs", () => {
    const items = [
      { value: "closed_won", label: "Closed won" },
      { value: "closed_won", label: "Closed won again" },
      { value: "closed_lost", label: "Closed lost" },
      { value: "lead", label: "Lead" },
    ];
    expect(validateItemsInUse(items, deals, "stage", "stages")).toBe(
      "Duplicate stages: closed_won",
    );
  });

  it("detects duplicates via slug fallback when value is empty", () => {
    const items = [
      { value: "", label: "Lead" },
      { value: "lead", label: "Qualified lead" },
      { value: "closed_lost", label: "Closed lost" },
      { value: "closed_won", label: "Closed won" },
    ];
    expect(validateItemsInUse(items, deals, "stage", "stages")).toBe(
      "Duplicate stages: lead",
    );
  });

  it("returns 'Validating…' when deals have not loaded yet", () => {
    const items = [{ value: "closed_won", label: "Closed won" }];
    expect(validateItemsInUse(items, undefined, "stage", "stages")).toBe(
      "Validating…",
    );
  });

  it("ignores deals with a falsy value for the checked field", () => {
    const dealsWithEmpty: RaRecord[] = [
      { id: 1, stage: "closed_won", category: "" },
      { id: 2, stage: "closed_won", category: null },
    ];
    const items = [{ value: "other", label: "Other" }];
    expect(
      validateItemsInUse(items, dealsWithEmpty, "category", "categories"),
    ).toBe(undefined);
  });

  it("works with the category field", () => {
    const items = [{ value: "ui-design", label: "UI Design" }];
    expect(
      validateItemsInUse(items, deals, "category", "categories"),
    ).toContain("copywriting");
  });
});
