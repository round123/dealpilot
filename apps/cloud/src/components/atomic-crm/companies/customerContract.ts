export const CUSTOMER_GRADES = ["A", "B", "C"] as const;
export const CUSTOMER_STATUSES = ["active", "inactive"] as const;
export const CUSTOMER_SORT_FIELDS = [
  "name",
  "created_at",
  "updated_at",
  "grade",
] as const;
export const CUSTOMER_SEARCH_COLUMNS = ["name", "company", "country"] as const;

export const ACTIVE_CUSTOMER_FILTER = { "deleted_at@is": null } as const;

export type CustomerGrade = (typeof CUSTOMER_GRADES)[number];
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
