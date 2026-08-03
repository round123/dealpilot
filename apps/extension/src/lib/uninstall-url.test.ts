import { describe, expect, test } from "bun:test";
import { safeUninstallUrl } from "./uninstall-url";

describe("extension uninstall guidance URL", () => {
  test("allows only a remote HTTPS documentation page", () => {
    expect(safeUninstallUrl("https://docs.example.com/dealpilot/reinstall"))
      .toBe("https://docs.example.com/dealpilot/reinstall");
  });

  test("rejects loopback, insecure, credentialed, and token-bearing URLs", () => {
    expect(safeUninstallUrl("http://docs.example.com/reinstall")).toBeNull();
    expect(safeUninstallUrl("https://127.0.0.1:31081/reinstall")).toBeNull();
    expect(safeUninstallUrl("https://user:pass@docs.example.com/reinstall")).toBeNull();
    expect(safeUninstallUrl("https://docs.example.com/reinstall?token=secret")).toBeNull();
  });
});
