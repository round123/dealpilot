import type { SortPayload } from "ra-core";

export const getDefaultReferenceSort = (
  reference: string,
  sort?: SortPayload,
): SortPayload | undefined =>
  sort ??
  (reference === "companies" ? { field: "name", order: "ASC" } : undefined);
