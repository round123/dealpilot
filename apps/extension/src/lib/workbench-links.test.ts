import { describe, expect, test } from "bun:test";
import { buildWorkbenchUrl, workbenchHash } from "./workbench-links";

describe("Atomic workbench links", () => {
  const pairing = {
    token: "runtime token+/=",
    port: 31081,
    workbenchOrigin: "http://127.0.0.1:5173",
  };

  test("places the runtime token before the Atomic hash route", () => {
    const url = buildWorkbenchUrl(pairing, "reminders");
    expect(url).toBe(
      "http://127.0.0.1:5173/?token=runtime+token%2B%2F%3D#/reminders",
    );
    expect(new URL(url).searchParams.get("token")).toBe(pairing.token);
  });

  test("uses the paired Agent port when no separate workbench origin exists", () => {
    expect(
      buildWorkbenchUrl({ token: "secret", port: 31082 }, "projects"),
    ).toBe("http://127.0.0.1:31082/?token=secret#/deals");
  });

  test("does not send the runtime token to a non-loopback origin", () => {
    expect(
      buildWorkbenchUrl(
        { token: "secret", port: 31081, workbenchOrigin: "https://example.com" },
        "home",
      ),
    ).toBe("http://127.0.0.1:31081/?token=secret#/");
  });

  test("builds customer list, create, and detail routes", () => {
    expect(workbenchHash("customers")).toBe("#/contacts");
    expect(workbenchHash("new-customer")).toBe("#/contacts/create");
    expect(workbenchHash({ customerId: "customer/one" })).toBe(
      "#/contacts/customer%2Fone/show",
    );
  });
});
