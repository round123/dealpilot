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
const productionMonitor = readFileSync(
  ".github/workflows/monitor-production.yml",
  "utf8",
);
const adminAccountCleanup = readFileSync(
  ".github/workflows/admin-account-cleanup.yml",
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

test("database security CI gates Dashboard, backup, retention, and account cleanup", () => {
  const databaseSecurity = ci.slice(ci.indexOf("  database-security:"));
  const reset = databaseSecurity.indexOf("supabase db reset");
  const dashboard = databaseSecurity.indexOf(
    "-f supabase/tests/dashboard_summary.sql",
  );
  const backup = databaseSecurity.indexOf(
    "-f supabase/tests/backup_isolation.sql",
  );
  const retention = databaseSecurity.indexOf(
    "-f supabase/tests/data_retention.sql",
  );
  const accountCleanup = databaseSecurity.indexOf(
    "-f supabase/tests/admin_account_cleanup.sql",
  );
  const browserBuild = databaseSecurity.indexOf(
    "Build Cloud against local Supabase",
  );
  const dashboardStep =
    databaseSecurity.match(
      /- name: Verify Dashboard summary aggregation and account isolation[\s\S]*?(?=\n      - name:)/,
    )?.[0] ?? "";
  const backupStep =
    databaseSecurity.match(
      /- name: Verify backup restore and account isolation[\s\S]*?(?=\n      - name:)/,
    )?.[0] ?? "";
  const retentionStep =
    databaseSecurity.match(
      /- name: Verify automatic data retention behavior and privileges[\s\S]*?(?=\n      - name:)/,
    )?.[0] ?? "";

  assert.ok(reset >= 0);
  assert.ok(dashboard > reset);
  assert.ok(backup > dashboard);
  assert.ok(retention > backup);
  assert.ok(accountCleanup > retention);
  assert.ok(browserBuild > accountCleanup);
  assert.match(dashboardStep, /-v ON_ERROR_STOP=1/);
  assert.match(dashboardStep, /-f supabase\/tests\/dashboard_summary\.sql/);
  assert.match(backupStep, /-v ON_ERROR_STOP=1/);
  assert.match(backupStep, /-f supabase\/tests\/backup_isolation\.sql/);
  assert.match(retentionStep, /-v ON_ERROR_STOP=1/);
  assert.match(retentionStep, /-f supabase\/tests\/data_retention\.sql/);
});

test("controlled account cleanup is main-only, approved, and explicitly confirmed", () => {
  assert.match(adminAccountCleanup, /workflow_dispatch:/);
  assert.match(adminAccountCleanup, /github\.ref == 'refs\/heads\/main'/);
  assert.match(adminAccountCleanup, /environment:\s+name: cloud-production/);
  assert.match(adminAccountCleanup, /target_user_id:/);
  assert.match(adminAccountCleanup, /idempotency_key:/);
  assert.match(adminAccountCleanup, /approval_url:/);
  assert.match(adminAccountCleanup, /PERMANENTLY DELETE DEALPILOT ACCOUNT/);
  assert.match(adminAccountCleanup, /functions\/v1\/admin-account-cleanup/);
  assert.match(
    adminAccountCleanup,
    /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/,
  );
  assert.doesNotMatch(adminAccountCleanup, /delete-account/);
});

test("normal release orders link, Auth config, migrations, Edge, Web and smoke", () => {
  const link = deploy.indexOf("Link selected Supabase project");
  const authConfig = deploy.indexOf("Push Supabase Auth configuration");
  const migration = deploy.indexOf("Apply forward-only database migrations");
  const edge = deploy.indexOf("Deploy Edge Functions");
  const web = deploy.indexOf("Deploy Pages artifact");
  const smoke = deploy.indexOf("Run authenticated production smoke");
  assert.ok(link > 0);
  assert.ok(authConfig > link);
  assert.ok(migration > authConfig);
  assert.ok(edge > migration);
  assert.ok(web > edge);
  assert.ok(smoke > web);
  assert.match(
    deploy,
    /supabase config push --project-ref "\$SUPABASE_PROJECT_REF" --yes/,
  );
});

test("production deploys only a successful completed CI push for main", () => {
  assert.match(
    deploy,
    /workflow_run:\s+workflows:\s+- CI\s+types:\s+- completed/,
  );
  assert.match(
    deploy,
    /github\.event\.workflow_run\.event == 'push'[\s\S]+github\.event\.workflow_run\.conclusion == 'success'[\s\S]+github\.event\.workflow_run\.head_branch == 'main'/,
  );
  const pushTrigger =
    deploy.match(/  push:\r?\n([\s\S]*?)\r?\n\r?\npermissions:/)?.[1] ?? "";
  assert.match(pushTrigger, /"codex\/\*\*"/);
  assert.doesNotMatch(pushTrigger, /- main/);
});

test("every deploy job checks out the immutable planned release SHA", () => {
  assert.match(
    deploy,
    /ref: \$\{\{ github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/,
  );
  assert.match(deploy, /release_sha="\$CI_HEAD_SHA"/);
  assert.match(deploy, /echo "release_sha=\$release_sha"/);
  assert.equal(
    deploy.match(/ref: \$\{\{ needs\.plan\.outputs\.release_sha \}\}/g)?.length,
    3,
  );
});

test("manual production dispatch is restricted to main", () => {
  assert.match(
    deploy,
    /\[ "\$channel" = "production" \][\s\S]+\[ "\$EVENT_NAME" != "workflow_run" \][\s\S]+\[ "\$REF_NAME" != "main" \]/,
  );
  assert.match(
    deploy,
    /Production deployment is restricted to the main workflow ref/,
  );
});

test("non-main releases use isolated preview/canary credentials", () => {
  assert.match(
    deploy,
    /elif \[ "\$EVENT_NAME" = "push" \]; then\s+channel="preview"/,
  );
  assert.match(
    deploy,
    /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/,
  );
  assert.doesNotMatch(deploy, /PREVIEW_SUPABASE_ACCESS_TOKEN/);
  assert.doesNotMatch(deploy, /CANARY_SUPABASE_ACCESS_TOKEN/);
  assert.match(deploy, /PREVIEW_SUPABASE_PROJECT_REF/);
  assert.match(deploy, /CANARY_SUPABASE_PROJECT_REF/);
  assert.match(
    deploy,
    /PRODUCTION_PROJECT_REF: \$\{\{ vars\.PRODUCTION_SUPABASE_PROJECT_REF \}\}/,
  );
  assert.doesNotMatch(
    deploy,
    /PRODUCTION_PROJECT_REF: \$\{\{ secrets\.SUPABASE_PROJECT_REF \}\}/,
  );
  assert.match(
    deploy,
    /Preview\/canary project must not equal the production project/,
  );
  assert.match(deploy, /Upload preview\/canary artifact/);
});

test("production requires an authenticated Customer smoke baseline", () => {
  assert.match(deploy, /CLOUD_SMOKE_REQUIRE_AUTHENTICATED: "true"/);
  assert.match(deploy, /secrets\.CLOUD_SMOKE_EMAIL/);
  assert.match(deploy, /secrets\.CLOUD_SMOKE_PASSWORD/);
  assert.match(deploy, /secrets\.CLOUD_SMOKE_EXPECTED_CUSTOMER_JSON/);
  assert.match(deploy, /Run authenticated production smoke/);
  assert.match(
    deploy,
    /Authenticated Customer count and related summary: passed/,
  );
});

test("Preview gates the built artifact with ordinary hosted accounts and data tools", () => {
  assert.match(
    deploy,
    /Gate Preview with hosted account, import, and export acceptance/,
  );
  assert.match(deploy, /test:e2e:preview/);
  assert.match(
    deploy,
    /build-web:[\s\S]*?environment:\s+name: cloud-\$\{\{ needs\.plan\.outputs\.channel \}\}/,
  );
  assert.match(
    deploy,
    /PLAYWRIGHT_BROWSERS_PATH: \$\{\{ github\.workspace \}\}\/\.playwright-browsers/,
  );
  assert.match(deploy, /secrets\.PREVIEW_E2E_ALPHA_EMAIL/);
  assert.match(deploy, /secrets\.PREVIEW_E2E_ALPHA_PASSWORD/);
  assert.match(deploy, /secrets\.PREVIEW_E2E_BETA_EMAIL/);
  assert.match(deploy, /secrets\.PREVIEW_E2E_BETA_PASSWORD/);
  assert.match(deploy, /Hosted two-account Customer acceptance: passed/);
  assert.match(
    deploy,
    /Hosted CSV import persistence and isolated XLSX export: passed/,
  );
  assert.match(deploy, /Upload hosted Preview E2E failure evidence/);
  assert.match(deploy, /path: apps\/cloud\/test-results\/preview-hosted-e2e/);
  assert.doesNotMatch(
    deploy.match(
      /- name: Gate Preview with hosted account, import, and export acceptance[\s\S]*?(?=\n      - name:)/,
    )?.[0] ?? "",
    /SERVICE_ROLE/,
  );
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
  assert.match(customerPurge, /body\.data\.failed !== 0/);
  assert.match(customerPurge, /failed and require retry/);
  assert.doesNotMatch(customerPurge, /supabase\s+(?:db|migration)|SQLite/i);
});

test("production health is monitored without deployment approval or privileged credentials", () => {
  assert.match(productionMonitor, /cron: "7,22,37,52 \* \* \* \*"/);
  assert.match(productionMonitor, /node scripts\/cloud-smoke\.mjs/);
  assert.match(
    productionMonitor,
    /CLOUD_SMOKE_FUNCTIONS: purge-expired-customers/,
  );
  assert.match(productionMonitor, /issues: write/);
  assert.match(productionMonitor, /if: failure\(\)/);
  assert.match(productionMonitor, /if: success\(\)/);
  assert.doesNotMatch(
    productionMonitor,
    /environment:\s+name: cloud-production/,
  );
  assert.doesNotMatch(
    productionMonitor,
    /SERVICE_ROLE|DB_PASSWORD|SMOKE_PASSWORD|SMOKE_EMAIL/,
  );
});
