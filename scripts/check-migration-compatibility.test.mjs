import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMigrationSql,
  checkViolations,
} from "./check-migration-compatibility.mjs";

test("allows additive migrations", () => {
  const sql = `
    create table public.examples (id uuid primary key);
    alter table public.examples add column label text;
    create or replace function public.example() returns void language sql as $$
      select null where 'drop table is documentation only' is null;
    $$;
  `;
  assert.deepEqual(analyzeMigrationSql(sql), []);
});

test("blocks destructive DDL and rename operations", () => {
  const sql = `
    drop table public.old_examples;
    alter table public.examples drop column legacy;
    drop function public.old_function();
    drop type public.old_status;
    alter table public.examples rename column name to display_name;
    alter table public.examples alter column amount type bigint;
  `;
  assert.deepEqual(
    analyzeMigrationSql(sql).map(({ rule }) => rule),
    [
      "drop-table",
      "drop-column",
      "drop-function",
      "drop-type",
      "rename",
      "alter-column-type",
    ],
  );
});

test("requires the exact approval URL from an adjacent exception marker", () => {
  const sql = `
    -- dealpilot:allow-destructive-migration approval=https://github.com/round123/dealpilot/pull/42 reason=approved two-release cleanup
    drop function public.retired_contract();
  `;
  const violations = analyzeMigrationSql(sql);
  assert.equal(checkViolations(violations)[0].allowed, false);
  assert.equal(
    checkViolations(
      violations,
      "https://github.com/round123/dealpilot/pull/42",
    )[0].allowed,
    true,
  );
});
