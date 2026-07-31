import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");

function readRepositoryFile(path: string): string {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

describe("Atomic local workbench packaging", () => {
  test("defines an Agent-mode Cloud build without a browser-visible API URL", () => {
    const cloudPackage = JSON.parse(
      readRepositoryFile("apps/cloud/package.json"),
    ) as { scripts: Record<string, string> };
    const agentEnvironment = readRepositoryFile("apps/cloud/.env.agent");

    expect(cloudPackage.scripts["build:agent"]).toContain("--mode agent");
    expect(agentEnvironment).toContain("VITE_DATA_BACKEND=agent");
    expect(agentEnvironment).not.toContain("VITE_AGENT_API_URL");
  });

  test("stages the Atomic build instead of the legacy V1 frontend", () => {
    const installer = readRepositoryFile("scripts/build-installer.ps1");

    expect(installer).toContain("@dealpilot/cloud build:agent");
    expect(installer).toContain('"apps/cloud/dist"');
    expect(installer).not.toContain("apps/web/dist");
  });

  test("compiled QA exercises the sibling web directory", () => {
    const compiledQa = readRepositoryFile("scripts/qa-compiled-agent.ts");

    expect(compiledQa).toContain('join(root, "apps", "cloud", "dist")');
    expect(compiledQa).toContain('join(temporaryRoot, "web")');
    expect(compiledQa).toContain("delete env.DEALPILOT_WEB_DIR");
  });

  test("compiled QA uses sibling migrations and verifies the Chinese Atomic runtime", () => {
    const compiledQa = readRepositoryFile("scripts/qa-compiled-agent.ts");

    expect(compiledQa).toContain('join(temporaryRoot, "migrations")');
    expect(compiledQa).toContain("delete env.DEALPILOT_MIGRATIONS_DIR");
    expect(compiledQa).toContain('entrySource.includes("今日工作台")');
    expect(compiledQa).toContain('join(dataDirectory, "data", "dealpilot.db")');
    expect(compiledQa).toContain("DEALPILOT_SKIP_NM_REGISTRATION: \"1\"");
  });
});
