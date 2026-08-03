import { describe, expect, it } from "vitest";

import {
  getPasswordRecoveryCode,
  getPasswordRecoveryRedirectUrl,
  removeTopLevelRecoveryCode,
} from "./password-recovery-url";

describe("password recovery URLs", () => {
  it("preserves the GitHub Pages deployment path and hash router", () => {
    const baseUrl = "/dealpilot/";
    const currentUrl = "https://example.github.io/dealpilot/#/forgot-password";

    const redirectUrl = getPasswordRecoveryRedirectUrl(baseUrl, currentUrl);

    expect(redirectUrl).toBe(
      "https://example.github.io/dealpilot/#/set-password",
    );
  });

  it("keeps the local password page in the hash router", () => {
    const baseUrl = "/";
    const currentUrl = "http://localhost:5173/#/forgot-password";

    const redirectUrl = getPasswordRecoveryRedirectUrl(baseUrl, currentUrl);

    expect(redirectUrl).toBe("http://localhost:5173/#/set-password");
  });

  it("resolves a relative Vite base from the current page", () => {
    const baseUrl = "./";
    const currentUrl = "https://example.github.io/dealpilot/#/forgot-password";

    const redirectUrl = getPasswordRecoveryRedirectUrl(baseUrl, currentUrl);

    expect(redirectUrl).toBe(
      "https://example.github.io/dealpilot/#/set-password",
    );
  });

  it("reads the recovery code from the router query", () => {
    const routerSearch = "?code=router-code";
    const topLevelSearch = "";

    const code = getPasswordRecoveryCode(routerSearch, topLevelSearch);

    expect(code).toBe("router-code");
  });

  it("falls back to the top-level query used by Supabase PKCE", () => {
    const routerSearch = "";
    const topLevelSearch = "?code=top-level-code";

    const code = getPasswordRecoveryCode(routerSearch, topLevelSearch);

    expect(code).toBe("top-level-code");
  });

  it("removes only the top-level code and preserves hash navigation", () => {
    const currentUrl =
      "https://example.github.io/dealpilot/?code=secret&source=email#/set-password";

    const cleanedUrl = removeTopLevelRecoveryCode(currentUrl);

    expect(cleanedUrl).toBe(
      "https://example.github.io/dealpilot/?source=email#/set-password",
    );
  });
});
