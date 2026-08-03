import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APPROVAL_MARKER =
  /--\s*dealpilot:allow-destructive-migration\s+approval=(https:\/\/\S+)\s+reason=(\S.*)$/i;

const RULES = [
  ["drop-table", /\bdrop\s+table\b/gi],
  ["drop-column", /\balter\s+table\b[^;]{0,800}?\bdrop\s+column\b/gi],
  ["drop-function", /\bdrop\s+function\b/gi],
  ["drop-type", /\bdrop\s+type\b/gi],
  ["rename", /\brename\s+(?:to|column|constraint|attribute|value)\b/gi],
  [
    "alter-column-type",
    /\balter\s+table\b[^;]{0,800}?\balter\s+column\b[^;]{0,300}?\b(?:set\s+data\s+)?type\b/gi,
  ],
];

export function analyzeMigrationSql(sql, file = "migration.sql") {
  const masked = maskCommentsAndStrings(sql);
  const lines = sql.split(/\r?\n/);
  const violations = [];

  for (const [rule, pattern] of RULES) {
    pattern.lastIndex = 0;
    for (
      let match = pattern.exec(masked);
      match;
      match = pattern.exec(masked)
    ) {
      const line = masked.slice(0, match.index).split("\n").length;
      const marker = findApprovalMarker(lines, line);
      violations.push({
        file,
        line,
        rule,
        approval: marker?.approval,
        reason: marker?.reason,
      });
    }
  }

  return violations.sort((left, right) => left.line - right.line);
}

export function checkViolations(violations, suppliedApproval = "") {
  return violations.map((violation) => ({
    ...violation,
    allowed:
      violation.approval !== undefined &&
      suppliedApproval !== "" &&
      suppliedApproval === violation.approval,
  }));
}

function findApprovalMarker(lines, statementLine) {
  const firstLine = Math.max(0, statementLine - 5);
  for (let index = statementLine - 1; index >= firstLine; index -= 1) {
    const match = lines[index]?.match(APPROVAL_MARKER);
    if (match) return { approval: match[1], reason: match[2].trim() };
  }
  return undefined;
}

function maskCommentsAndStrings(sql) {
  let result = "";
  let index = 0;
  let mode = "normal";
  let dollarTag = "";

  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];

    if (mode === "normal" && current === "-" && next === "-") {
      mode = "line-comment";
      result += "  ";
      index += 2;
      continue;
    }
    if (mode === "normal" && current === "/" && next === "*") {
      mode = "block-comment";
      result += "  ";
      index += 2;
      continue;
    }
    if (mode === "normal" && current === "'") {
      mode = "single-quote";
      result += " ";
      index += 1;
      continue;
    }
    if (mode === "normal" && current === "$") {
      const tag = sql
        .slice(index)
        .match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        mode = "dollar-quote";
        dollarTag = tag;
        result += " ".repeat(tag.length);
        index += tag.length;
        continue;
      }
    }

    if (mode === "line-comment") {
      if (current === "\n") {
        mode = "normal";
        result += "\n";
      } else {
        result += " ";
      }
      index += 1;
      continue;
    }
    if (mode === "block-comment") {
      if (current === "*" && next === "/") {
        mode = "normal";
        result += "  ";
        index += 2;
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (mode === "single-quote") {
      if (current === "'" && next === "'") {
        result += "  ";
        index += 2;
      } else if (current === "'") {
        mode = "normal";
        result += " ";
        index += 1;
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (mode === "dollar-quote") {
      if (sql.startsWith(dollarTag, index)) {
        mode = "normal";
        result += " ".repeat(dollarTag.length);
        index += dollarTag.length;
      } else {
        result += current === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    result += current;
    index += 1;
  }

  return result;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function changedMigrationFiles(base, head) {
  if (!base || !head) return [];
  const output = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      base,
      head,
      "--",
      "supabase/migrations/*.sql",
    ],
    { encoding: "utf8" },
  );
  return output.split(/\r?\n/).filter(Boolean);
}

function main() {
  const base = argumentValue("--base");
  const head = argumentValue("--head") ?? "HEAD";
  const approval = argumentValue("--approval") ?? "";
  const explicitFiles = process.argv.filter((value) => value.endsWith(".sql"));
  const files = explicitFiles.length
    ? explicitFiles
    : changedMigrationFiles(base, head);

  if (files.length === 0) {
    console.log(
      "No changed PostgreSQL migrations require compatibility review.",
    );
    return;
  }

  const violations = files.flatMap((file) => {
    if (!existsSync(file)) return [];
    return analyzeMigrationSql(readFileSync(file, "utf8"), file);
  });
  const checked = checkViolations(violations, approval);
  const blocked = checked.filter((violation) => !violation.allowed);

  for (const violation of checked) {
    const location = `${violation.file}:${violation.line}`;
    if (violation.allowed) {
      console.log(
        `APPROVED ${location} ${violation.rule} (${violation.approval}; ${violation.reason})`,
      );
    } else if (violation.approval) {
      console.error(
        `BLOCKED ${location} ${violation.rule}: rerun the manual deployment with migration_approval=${violation.approval}`,
      );
    } else {
      console.error(
        `BLOCKED ${location} ${violation.rule}: use an additive migration; exceptional changes require an adjacent approval URL and reason`,
      );
    }
  }

  if (blocked.length > 0) process.exitCode = 1;
  else
    console.log(
      `Checked ${files.length} migration file(s); compatibility gate passed.`,
    );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
