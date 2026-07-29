import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(import.meta.dir, "..", "src");

function TypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? TypeScriptFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

function importsFrom(directory: string) {
  return TypeScriptFiles(join(sourceRoot, directory)).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => ({
      file: file.slice(sourceRoot.length + 1),
      specifier: match[1],
    }));
  });
}

describe("pragmatic three-layer boundaries", () => {
  test("routes contain no persistence access", () => {
    const violations = importsFrom("routes").filter(({ specifier }) =>
      specifier === "drizzle-orm"
      || specifier.includes("/db/")
      || specifier.includes("/repositories/"),
    );
    expect(violations).toEqual([]);
  });

  test("services contain no HTTP or persistence implementation", () => {
    const violations = importsFrom("services").filter(({ specifier }) =>
      specifier === "drizzle-orm"
      || specifier.includes("/db/")
      || specifier.includes("/routes/")
      || specifier.includes("/middleware/"),
    );
    expect(violations).toEqual([]);
  });

  test("repositories never depend on upper layers", () => {
    const violations = importsFrom("repositories").filter(({ specifier }) =>
      specifier.includes("/services/")
      || specifier.includes("/routes/")
      || specifier.includes("/middleware/"),
    );
    expect(violations).toEqual([]);
  });

  test("schedulers trigger services instead of querying storage", () => {
    const violations = importsFrom("scheduler").filter(({ specifier }) =>
      specifier === "drizzle-orm"
      || specifier.includes("/db/")
      || specifier.includes("/repositories/"),
    );
    expect(violations).toEqual([]);
  });
});
