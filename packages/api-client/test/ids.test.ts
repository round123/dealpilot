import { describe, expect, expectTypeOf, it } from "vitest";
import { CustomerIdSchema, type CustomerId, type UserId } from "../src/ids.js";

describe("branded IDs", () => {
  it("brands UUIDs at the parse boundary", () => {
    const id = CustomerIdSchema.parse("550e8400-e29b-41d4-a716-446655440000");

    expect(id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expectTypeOf(id).toEqualTypeOf<CustomerId>();
    expectTypeOf<CustomerId>().not.toEqualTypeOf<UserId>();
  });
});
