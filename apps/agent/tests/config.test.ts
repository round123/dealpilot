import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { resolveWebDir, resolveWorkbenchOrigin } from "../src/config/config";

describe("web directory resolution", () => {
  test("uses the Atomic Cloud build in source development", () => {
    const repositoryRoot = resolve(import.meta.dir, "../../..");

    expect(
      resolveWebDir(
        "",
        join(repositoryRoot, "tools", "bun.exe"),
        repositoryRoot,
      ),
    ).toBe(join(repositoryRoot, "apps", "cloud", "dist"));
  });

  test("uses the web directory beside a compiled Agent", () => {
    const executable = resolve("C:/DealPilot/app/dealpilot-agent.exe");

    expect(resolveWebDir("", executable, "C:/ignored")).toBe(
      resolve("C:/DealPilot/app/web"),
    );
  });

  test("keeps an explicit web directory override", () => {
    const repositoryRoot = resolve(import.meta.dir, "../../..");

    expect(
      resolveWebDir(
        "custom-web",
        join(repositoryRoot, "tools", "bun.exe"),
        repositoryRoot,
      ),
    ).toBe(join(repositoryRoot, "custom-web"));
  });
});

describe("workbench origin resolution", () => {
  test("accepts an exact local Vite origin", () => {
    expect(resolveWorkbenchOrigin("http://127.0.0.1:5173")).toBe(
      "http://127.0.0.1:5173",
    );
  });

  test("rejects paths and non-loopback origins", () => {
    expect(() => resolveWorkbenchOrigin("http://127.0.0.1:5173/path")).toThrow();
    expect(() => resolveWorkbenchOrigin("https://example.com")).toThrow();
  });
});
