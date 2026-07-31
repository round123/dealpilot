import { describe, expect, test } from "bun:test";
import { MatchResolveResponseSchema } from "../src";

const customer = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "匹配客户",
  company: null,
  country: null,
  source: null,
  grade: "A",
  status: "active",
  deleted_at: null,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
};

describe("match response contract", () => {
  test("distinguishes automatic, manual, and no-match responses", () => {
    expect(MatchResolveResponseSchema.parse({
      status: "unique",
      match_method: "phone",
      customer,
    }).match_method).toBe("phone");
    expect(MatchResolveResponseSchema.parse({
      status: "unique",
      match_method: "manual",
      customer,
    }).match_method).toBe("manual");
    expect(MatchResolveResponseSchema.parse({
      status: "none",
      match_method: null,
    })).toEqual({ status: "none", match_method: null });
  });

  test("rejects a unique result without a source", () => {
    expect(MatchResolveResponseSchema.safeParse({
      status: "unique",
      customer,
    }).success).toBe(false);
  });
});
