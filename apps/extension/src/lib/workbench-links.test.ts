import { describe, expect, test } from "bun:test";

import { buildWorkbenchUrl, workbenchHash } from "./workbench-links";

describe("Cloud workbench links", () => {
  test("builds an HTTPS route without putting credentials in the URL", () => {
    const url = buildWorkbenchUrl("https://crm.example.com/app?stale=1", "reminders");
    expect(url).toBe("https://crm.example.com/app#/reminders");
    expect(url).not.toContain("token");
  });

  test("rejects non-HTTPS remote origins", () => {
    expect(() => buildWorkbenchUrl("http://crm.example.com", "home")).toThrow();
  });

  test("maps destinations to existing Cloud routes", () => {
    expect(workbenchHash("customers")).toBe("#/contacts");
    expect(workbenchHash("new-customer")).toBe("#/contacts/create");
    expect(workbenchHash({ customerId: "customer/one" })).toBe(
      "#/contacts/customer%2Fone/show",
    );
  });
});
