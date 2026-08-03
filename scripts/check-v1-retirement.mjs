import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const forbiddenPaths = [
  "apps/agent",
  "apps/web",
  "apps/cloud/.env.agent",
  "apps/cloud/playwright.agent.config.ts",
  "apps/cloud/e2e/agent-local-tools.spec.ts",
  "apps/cloud/e2e/agent-loopback-network.ts",
  "apps/cloud/src/components/atomic-crm/providers/agent",
  "apps/cloud/src/components/atomic-crm/providers/localDataOperations.tsx",
  "apps/cloud/src/components/atomic-crm/settings/LocalDataToolsPage.tsx",
  "apps/extension/src/lib/content-agent-client.ts",
  "scripts/build-installer.ps1",
  "scripts/installer",
  "scripts/qa-compiled-agent.ts",
  "scripts/test-nm.ts",
  "docs/openapi.yaml",
  "docs/db-schema.ts",
  "packages/shared/src/constants/api-paths.ts",
  "packages/shared/src/schemas/settings.ts",
  "packages/shared/src/schemas/stats.ts",
  "packages/shared/src/schemas/system.ts",
  "packages/shared/tests/stats-contract.test.ts",
];

const requiredPaths = [
  "apps/cloud/package.json",
  "apps/extension/package.json",
  "packages/api-client/package.json",
  "packages/migration/package.json",
  "packages/shared/package.json",
  "docs/runbooks/v1-sqlite-migration.md",
];

const forbiddenReferences = [
  "@dealpilot/agent",
  "@dealpilot/web",
  "apps/agent",
  "apps\\agent",
  "apps/web",
  "apps\\web",
  "dealpilot-agent.exe",
  "VITE_AGENT_API_URL",
  "VITE_DATA_BACKEND",
  "providers/agent",
  "AgentContactInputs",
  "LocalDataOperations",
  "LocalDataToolsPage",
  "content-agent-client",
];

const scanRoots = [
  ".github/workflows",
  "apps/cloud/src",
  "apps/cloud/e2e",
  "apps/extension/entrypoints",
  "apps/extension/src",
  "packages",
];

const rootFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "apps/cloud/package.json",
  "apps/extension/package.json",
];

const failures = [];

for (const relative of forbiddenPaths) {
  if (existsSync(path.join(root, relative))) {
    failures.push(`forbidden retired path exists: ${relative}`);
  }
}

for (const relative of requiredPaths) {
  if (!existsSync(path.join(root, relative))) {
    failures.push(`required V2 or migration path is missing: ${relative}`);
  }
}

const files = rootFiles.map((relative) => path.join(root, relative));
for (const relative of scanRoots) {
  collectFiles(path.join(root, relative), files);
}

for (const file of files) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (relative.endsWith(".test.ts") || relative.endsWith(".test.tsx")) continue;
  const source = readFileSync(file, "utf8");
  for (const forbidden of forbiddenReferences) {
    if (source.includes(forbidden)) {
      failures.push(`${relative} references retired runtime token: ${forbidden}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`BLOCKED ${failure}`);
  process.exitCode = 1;
} else {
  console.log("V1 runtime retirement gate passed.");
}

function collectFiles(directory, output) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["dist", "node_modules", ".turbo", ".output"].includes(entry.name)) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolute, output);
      continue;
    }
    if (!entry.isFile() || !isScannable(absolute)) continue;
    output.push(absolute);
  }
}

function isScannable(file) {
  if (!statSync(file).isFile()) return false;
  return [".json", ".mjs", ".ts", ".tsx", ".yaml", ".yml"].includes(
    path.extname(file),
  );
}
