import { describe, expect, it } from "vitest";

import { getSignUpRedirectUrl } from "./signup-redirect-url";

describe("sign-up redirect URLs", () => {
  it("preserves the GitHub Pages deployment base path", () => {
    const redirectUrl = getSignUpRedirectUrl(
      "/dealpilot/",
      "https://example.github.io/dealpilot/#/sign-up",
    );

    expect(redirectUrl).toBe(
      "https://example.github.io/dealpilot/auth-callback.html",
    );
  });

  it("targets the localhost app root during local development", () => {
    const redirectUrl = getSignUpRedirectUrl(
      "/",
      "http://localhost:5173/#/sign-up",
    );

    expect(redirectUrl).toBe("http://localhost:5173/auth-callback.html");
  });

  it("resolves Vite's relative production base from the current page", () => {
    const redirectUrl = getSignUpRedirectUrl(
      "./",
      "https://example.github.io/dealpilot/#/sign-up",
    );

    expect(redirectUrl).toBe(
      "https://example.github.io/dealpilot/auth-callback.html",
    );
  });
});
