import { describe, expect, it } from "vitest";

import { getErrorMessageKey } from "./error-message";

describe("getErrorMessageKey", () => {
  it("uses typed API error codes without exposing server messages", () => {
    expect(
      getErrorMessageKey({
        code: "NETWORK_ERROR",
        message: "private upstream details",
      }),
    ).toBe("errors.network");
  });

  it("maps expired sessions and unauthorized responses", () => {
    expect(getErrorMessageKey({ status: 401 })).toBe("errors.unauthorized");
    expect(getErrorMessageKey(new Error("Invalid Refresh Token"))).toBe(
      "errors.unauthorized",
    );
  });

  it("maps browser network failures", () => {
    expect(getErrorMessageKey(new TypeError("Failed to fetch"))).toBe(
      "errors.network",
    );
  });

  it("maps invalid credentials to the auth-specific message", () => {
    expect(getErrorMessageKey(new Error("Invalid login credentials"))).toBe(
      "crm.auth.invalid_credentials",
    );
  });

  it("preserves explicit translation keys", () => {
    expect(
      getErrorMessageKey(
        new Error("crm.auth.authentication_unavailable"),
        "crm.auth.signup.error",
      ),
    ).toBe("crm.auth.authentication_unavailable");
  });

  it("uses the operation fallback for unknown errors", () => {
    expect(
      getErrorMessageKey(
        new Error("private provider details"),
        "crm.auth.signup.error",
      ),
    ).toBe("crm.auth.signup.error");
  });
});
