import assert from "node:assert/strict";
import test from "node:test";

import {
  dependencyImporter,
  evaluateAuditReport,
  parseAuditReport,
  pnpmInvocation,
  runPnpmAudit,
} from "./audit-v2-production.mjs";

const ACTIVE_EXEMPTION_DATE = new Date("2026-08-02T00:00:00.000Z");

test("normalizes Windows paths and identifies the workspace importer", () => {
  assert.equal(
    dependencyImporter("apps\\cloud > ra-core@5.15.0 > react-router@7.18.2"),
    "apps/cloud",
  );
});

test("excludes V1 Agent findings and blocks active V2 high findings", () => {
  const result = evaluateAuditReport(
    report([
      advisory({
        id: "GHSA-agent",
        moduleName: "xlsx",
        paths: ["apps\\agent > xlsx@0.18.5"],
      }),
      advisory({
        id: "GHSA-extension",
        moduleName: "unsafe-package",
        paths: ["apps/extension > unsafe-package@1.0.0"],
      }),
    ]),
    ACTIVE_EXEMPTION_DATE,
  );

  assert.equal(result.ignored.length, 1);
  assert.equal(result.ignored[0].dependencyPath, "apps/agent > xlsx@0.18.5");
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].advisoryId, "GHSA-extension");
});

test("applies the React Router exemption only to the exact Cloud advisory", () => {
  const exact = evaluateAuditReport(
    report([
      advisory({
        id: "GHSA-qwww-vcr4-c8h2",
        moduleName: "react-router",
        paths: ["apps/cloud > react-router@7.18.2"],
      }),
    ]),
    ACTIVE_EXEMPTION_DATE,
  );
  assert.equal(exact.exempted.length, 1);
  assert.match(exact.exempted[0].exemption.reason, /Vite SPA/);

  const wrongModule = evaluateAuditReport(
    report([
      advisory({
        id: "GHSA-qwww-vcr4-c8h2",
        moduleName: "different-package",
        paths: ["apps/cloud > different-package@1.0.0"],
      }),
    ]),
    ACTIVE_EXEMPTION_DATE,
  );
  assert.equal(wrongModule.blocked.length, 1);

  const wrongImporter = evaluateAuditReport(
    report([
      advisory({
        id: "GHSA-qwww-vcr4-c8h2",
        moduleName: "react-router",
        paths: ["packages/api-client > react-router@7.18.2"],
      }),
    ]),
    ACTIVE_EXEMPTION_DATE,
  );
  assert.equal(wrongImporter.blocked.length, 1);
});

test("automatically blocks the React Router exemption after its deadline", () => {
  const result = evaluateAuditReport(
    report([
      advisory({
        id: "GHSA-qwww-vcr4-c8h2",
        moduleName: "react-router",
        paths: ["apps/cloud > react-router@7.18.2"],
      }),
    ]),
    new Date("2026-09-02T00:00:00.000Z"),
  );

  assert.equal(result.exempted.length, 0);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].expiredExemption.expired, true);
});

test("fails closed for registry errors, empty output, and invalid JSON", () => {
  assert.throws(
    () =>
      parseAuditReport(
        JSON.stringify({
          error: { code: "ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS", message: "missing" },
        }),
      ),
    /audit failed.*ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS/,
  );
  assert.throws(() => parseAuditReport(""), /empty response/);
  assert.throws(() => parseAuditReport("not-json"), /invalid JSON/);
  assert.throws(() => parseAuditReport("{}"), /advisories object/);
  assert.throws(
    () =>
      evaluateAuditReport(
        {
          advisories: {
            "1": {
              github_advisory_id: "GHSA-incomplete",
              title: "Incomplete advisory",
              module_name: "unsafe-package",
              severity: "high",
              findings: [],
            },
          },
        },
        ACTIVE_EXEMPTION_DATE,
      ),
    /incomplete advisory/,
  );
});

test("invokes pnpm with the official registry and accepts audit finding exit code", () => {
  const calls = [];
  const result = runPnpmAudit({
    now: ACTIVE_EXEMPTION_DATE,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return {
        status: 1,
        signal: null,
        stdout: JSON.stringify(
          report([
            advisory({
              id: "GHSA-agent",
              moduleName: "xlsx",
              paths: ["apps/agent > xlsx@0.18.5"],
            }),
          ]),
        ),
        stderr: "",
      };
    },
  });

  assert.equal(result.blocked.length, 0);
  assert.equal(calls.length, 1);
  const auditArgs = [
    "--registry=https://registry.npmjs.org/",
    "audit",
    "--prod",
    "--audit-level=high",
    "--json",
  ];
  assert.deepEqual(
    { command: calls[0].command, args: calls[0].args },
    pnpmInvocation(auditArgs),
  );
});

test("uses a fixed cmd invocation on Windows and direct pnpm elsewhere", () => {
  const args = ["audit", "--json"];
  const windows = pnpmInvocation(args, "win32");
  assert.match(windows.command, /(?:cmd\.exe|\\cmd\.exe)$/i);
  assert.deepEqual(windows.args, ["/d", "/s", "/c", "pnpm audit --json"]);
  assert.deepEqual(pnpmInvocation(args, "linux"), {
    command: "pnpm",
    args,
  });
});

test("fails closed when pnpm cannot start or exits unexpectedly", () => {
  assert.throws(
    () =>
      runPnpmAudit({
        spawn: () => ({ error: new Error("missing pnpm") }),
      }),
    /Unable to start pnpm audit/,
  );
  assert.throws(
    () =>
      runPnpmAudit({
        spawn: () => ({ status: 2, signal: null, stdout: "", stderr: "boom" }),
      }),
    /status 2: boom/,
  );
});

function report(advisories) {
  return {
    advisories: Object.fromEntries(
      advisories.map((entry, index) => [String(index + 1), entry]),
    ),
  };
}

function advisory({ id, moduleName, paths, severity = "high" }) {
  return {
    id,
    github_advisory_id: id,
    title: `${moduleName} advisory`,
    module_name: moduleName,
    severity,
    findings: [{ version: "1.0.0", paths }],
  };
}
