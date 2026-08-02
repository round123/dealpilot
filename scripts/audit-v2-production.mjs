import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const V2_IMPORTERS = new Set([
  "apps/cloud",
  "apps/extension",
  "packages/api-client",
  "packages/shared",
  "packages/migration",
]);

export const AUDIT_EXEMPTIONS = [
  {
    advisoryId: "GHSA-qwww-vcr4-c8h2",
    moduleName: "react-router",
    importer: "apps/cloud",
    expiresAt: "2026-09-01T23:59:59.999Z",
    reason: "DealPilot Cloud is a Vite SPA and does not use React Router RSC mode.",
  },
];

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const OFFICIAL_NPM_REGISTRY = "https://registry.npmjs.org/";

export function normalizeDependencyPath(value) {
  return value.replaceAll("\\", "/").trim();
}

export function dependencyImporter(value) {
  return normalizeDependencyPath(value).split(" > ", 1)[0];
}

export function parseAuditReport(stdout) {
  if (typeof stdout !== "string" || stdout.trim() === "") {
    throw new Error("pnpm audit returned an empty response");
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch (error) {
    throw new Error("pnpm audit returned invalid JSON", { cause: error });
  }

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("pnpm audit returned an invalid report object");
  }
  if (report.error) {
    const code = typeof report.error.code === "string" ? report.error.code : "UNKNOWN";
    const message =
      typeof report.error.message === "string"
        ? report.error.message
        : "Registry audit request failed";
    throw new Error(`pnpm audit failed (${code}): ${message}`);
  }
  if (
    !report.advisories ||
    typeof report.advisories !== "object" ||
    Array.isArray(report.advisories)
  ) {
    throw new Error("pnpm audit report does not contain an advisories object");
  }

  return report;
}

export function evaluateAuditReport(report, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("Audit evaluation requires a valid current date");
  }

  const blocked = [];
  const exempted = [];
  const ignored = [];

  for (const advisory of Object.values(report.advisories)) {
    validateAdvisory(advisory);
    if (!BLOCKING_SEVERITIES.has(advisory.severity)) continue;

    for (const finding of advisory.findings) {
      if (!finding || !Array.isArray(finding.paths) || finding.paths.length === 0) {
        throw new Error(`Audit advisory ${advisoryIdentity(advisory)} has no dependency paths`);
      }

      for (const rawPath of finding.paths) {
        if (typeof rawPath !== "string" || rawPath.trim() === "") {
          throw new Error(`Audit advisory ${advisoryIdentity(advisory)} has an invalid path`);
        }

        const dependencyPath = normalizeDependencyPath(rawPath);
        const importer = dependencyImporter(dependencyPath);
        const issue = {
          advisoryId: advisoryIdentity(advisory),
          moduleName: advisory.module_name,
          severity: advisory.severity,
          title: advisory.title,
          dependencyPath,
        };

        if (!V2_IMPORTERS.has(importer)) {
          ignored.push(issue);
          continue;
        }

        const exemption = matchingExemption(advisory, importer);
        if (exemption && now.getTime() <= Date.parse(exemption.expiresAt)) {
          exempted.push({ ...issue, exemption });
          continue;
        }

        blocked.push({
          ...issue,
          expiredExemption: exemption
            ? { ...exemption, expired: true }
            : undefined,
        });
      }
    }
  }

  return { blocked, exempted, ignored };
}

export function runPnpmAudit({ spawn = spawnSync, now = new Date() } = {}) {
  const auditArgs = [
    `--registry=${OFFICIAL_NPM_REGISTRY}`,
    "audit",
    "--prod",
    "--audit-level=high",
    "--json",
  ];
  const { command, args } = pnpmInvocation(auditArgs);
  const result = spawn(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(`Unable to start pnpm audit: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.signal) {
    throw new Error(`pnpm audit terminated by signal ${result.signal}`);
  }
  if (result.status !== 0 && result.status !== 1) {
    const details = result.stderr?.trim();
    throw new Error(
      `pnpm audit exited with status ${result.status}${details ? `: ${details}` : ""}`,
    );
  }

  const report = parseAuditReport(result.stdout);
  return evaluateAuditReport(report, now);
}

export function pnpmInvocation(auditArgs, platform = process.platform) {
  if (platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", `pnpm ${auditArgs.join(" ")}`],
    };
  }
  return { command: "pnpm", args: auditArgs };
}

function validateAdvisory(advisory) {
  if (!advisory || typeof advisory !== "object" || Array.isArray(advisory)) {
    throw new Error("pnpm audit returned an invalid advisory");
  }
  if (
    typeof advisory.module_name !== "string" ||
    typeof advisory.severity !== "string" ||
    typeof advisory.title !== "string" ||
    !Array.isArray(advisory.findings) ||
    advisory.findings.length === 0
  ) {
    throw new Error("pnpm audit returned an incomplete advisory");
  }
}

function advisoryIdentity(advisory) {
  return advisory.github_advisory_id || String(advisory.id || "UNKNOWN_ADVISORY");
}

function matchingExemption(advisory, importer) {
  return AUDIT_EXEMPTIONS.find(
    (exemption) =>
      exemption.advisoryId === advisoryIdentity(advisory) &&
      exemption.moduleName === advisory.module_name &&
      exemption.importer === importer,
  );
}

function formatIssue(issue) {
  return `${issue.severity.toUpperCase()} ${issue.advisoryId} ${issue.moduleName}: ${issue.dependencyPath}`;
}

function main() {
  const result = runPnpmAudit();

  for (const issue of result.exempted) {
    console.warn(
      `EXEMPT ${formatIssue(issue)}; reason=${issue.exemption.reason}; expires=${issue.exemption.expiresAt}`,
    );
  }

  if (result.blocked.length > 0) {
    for (const issue of result.blocked) {
      const expiry = issue.expiredExemption
        ? `; exemption expired=${issue.expiredExemption.expiresAt}`
        : "";
      console.error(`BLOCK ${formatIssue(issue)}${expiry}`);
    }
    throw new Error(
      `V2 production dependency audit found ${result.blocked.length} blocking path(s)`,
    );
  }

  console.log(
    `V2 production dependency audit passed (${result.exempted.length} exempted, ${result.ignored.length} non-V2 path(s) ignored).`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
