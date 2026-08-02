import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deploy = readFileSync(".github/workflows/deploy-cloud.yml", "utf8");
const rollback = readFileSync(".github/workflows/rollback-cloud.yml", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const customerPurge = readFileSync(
  ".github/workflows/purge-expired-customers.yml",
  "utf8",
);

test("quality CI tests and runs the V2 production audit after install", () => {
  const auditTest = ci.indexOf("scripts/audit-v2-production.test.mjs");
  const install = ci.indexOf("pnpm install --frozen-lockfile");
  const audit = ci.indexOf("pnpm audit:v2");
  assert.ok(auditTest > 0);
  assert.ok(install > auditTest);
  assert.ok(audit > install);
});

test("normal release orders migrations, Edge, Web and smoke", () => {
  const migration = deploy.indexOf("Apply forward-only database migrations");
  const edge = deploy.indexOf("Deploy Edge Functions");
  const web = deploy.indexOf("Deploy Pages artifact");
  const smoke = deploy.indexOf("Run pre-login smoke");
  assert.ok(migration > 0);
  assert.ok(edge > migration);
  assert.ok(web > edge);
  assert.ok(smoke > web);
});

test("non-main releases use isolated preview/canary credentials", () => {
  assert.match(deploy, /github\.ref_name[^\n]+main[^\n]+production/);
  assert.match(deploy, /PREVIEW_SUPABASE_PROJECT_REF/);
  assert.match(deploy, /CANARY_SUPABASE_PROJECT_REF/);
  assert.match(
    deploy,
    /Preview\/canary project must not equal the production project/,
  );
  assert.match(deploy, /Upload preview\/canary artifact/);
});

test("rollback redeploys only immutable Edge and Web application code", () => {
  assert.match(rollback, /verified_sha must be a full lowercase commit SHA/);
  assert.match(rollback, /git merge-base --is-ancestor/);
  assert.match(
    rollback,
    /ref: \$\{\{ needs\.verify-release\.outputs\.release_sha \}\}/,
  );
  assert.match(rollback, /PostgreSQL remains the fact source/);
  assert.match(
    rollback,
    /no migration, reset, down, or SQLite action is permitted/,
  );
  assert.doesNotMatch(
    rollback,
    /supabase\s+(?:db|migration)|\bdb\s+(?:reset|down)\b|supabase\s+link/i,
  );
});

test("both release paths publish and verify an immutable release marker", () => {
  for (const workflow of [deploy, rollback]) {
    assert.match(workflow, /release\.json/);
    assert.match(workflow, /scripts\/cloud-smoke\.mjs/);
    assert.match(workflow, /RELEASE_SHA/);
  }
});

test("rollback requires an authenticated Customer baseline from current PostgreSQL", () => {
  assert.match(rollback, /CLOUD_SMOKE_REQUIRE_AUTHENTICATED: "true"/);
  assert.match(rollback, /secrets\.CLOUD_SMOKE_EMAIL/);
  assert.match(rollback, /secrets\.CLOUD_SMOKE_PASSWORD/);
  assert.match(rollback, /secrets\.CLOUD_SMOKE_EXPECTED_CUSTOMER_JSON/);
  assert.match(rollback, /Authenticated Customer count and related summary/);
});

test("customer retention cleanup is scheduled without embedding its secret", () => {
  assert.match(customerPurge, /cron: "17 2 \* \* \*"/);
  assert.match(customerPurge, /environment:\s+name: cloud-production/);
  assert.match(
    customerPurge,
    /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/,
  );
  assert.match(customerPurge, /functions\/v1\/purge-expired-customers/);
  assert.match(customerPurge, /enqueue_limit/);
  assert.doesNotMatch(customerPurge, /supabase\s+(?:db|migration)|SQLite/i);
});
