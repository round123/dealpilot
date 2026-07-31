import { count } from "drizzle-orm";
import { config } from "../../src/config/config";
import { db } from "../../src/db/client";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { customers as customersTable, import_jobs } from "../../src/db/schema";
import { createApp } from "../../src/server";

const fixturePath = process.argv[2];
if (!fixturePath) throw new Error("Fixture path is required");

runMigrations();
ensureSchema();
const app = createApp();
const authorization = `Bearer ${config.token}`;

const formData = new FormData();
formData.append(
  "file",
  new File([await Bun.file(fixturePath).arrayBuffer()], "test_customers.xlsx"),
);
const parseResponse = await app.request("/api/v1/imports/parse", {
  method: "POST",
  headers: { Authorization: authorization },
  body: formData,
});
const parsed = await parseResponse.json();
if (!parseResponse.ok)
  throw new Error(`parse failed: ${JSON.stringify(parsed)}`);

const [{ count: previewCustomers }] = await db
  .select({ count: count() })
  .from(customersTable);
const [{ count: previewJobs }] = await db
  .select({ count: count() })
  .from(import_jobs);
const errorsBeforeCommit = await app.request(
  `/api/v1/imports/${parsed.job_id}/errors`,
  {
    headers: { Authorization: authorization },
  },
);

const failedCommitResponse = await app.request(
  `/api/v1/imports/${parsed.job_id}/commit`,
  {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      job_id: parsed.job_id,
      resolutions: [
        {
          row_index: 1,
          action: "merge",
          target_customer_id: "33333333-3333-4333-8333-333333333333",
        },
      ],
    }),
  },
);
const [{ count: customersAfterRollback }] = await db
  .select({ count: count() })
  .from(customersTable);
const [{ count: jobsAfterRollback }] = await db
  .select({ count: count() })
  .from(import_jobs);

const commitIdempotencyKey = crypto.randomUUID();
const commitBody = JSON.stringify({ job_id: parsed.job_id, resolutions: [] });
const commitResponse = await app.request(
  `/api/v1/imports/${parsed.job_id}/commit`,
  {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      "Idempotency-Key": commitIdempotencyKey,
    },
    body: commitBody,
  },
);
const committed = await commitResponse.json();
if (!commitResponse.ok)
  throw new Error(`commit failed: ${JSON.stringify(committed)}`);
const replayResponse = await app.request(
  `/api/v1/imports/${parsed.job_id}/commit`,
  {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      "Idempotency-Key": commitIdempotencyKey,
    },
    body: commitBody,
  },
);
const replayed = await replayResponse.json();
const [{ count: jobsAfterReplay }] = await db
  .select({ count: count() })
  .from(import_jobs);

const customersResponse = await app.request(
  "/api/v1/customers?search=Phase4&limit=20",
  {
    headers: { Authorization: authorization },
  },
);
const customers = await customersResponse.json();
if (!customersResponse.ok)
  throw new Error(`customer verification failed: ${JSON.stringify(customers)}`);
const persistedTimestampsAreIso = customers.items.every(
  (customer: { created_at: string; updated_at: string }) =>
    customer.created_at.endsWith("Z") && customer.updated_at.endsWith("Z"),
);
const errorsAfterCommit = await app.request(
  `/api/v1/imports/${parsed.job_id}/errors`,
  {
    headers: { Authorization: authorization },
  },
);

const mappedFile = new File(
  [
    "客户简称,采购邮箱,等级说明\n" +
      "自定义映射客户,mapped@example.com,A\n" +
      ",invalid@example.com,B\n",
  ],
  "mapped-customers.csv",
  { type: "text/csv" },
);
const mappedForm = new FormData();
mappedForm.set("file", mappedFile);
mappedForm.set(
  "mapping",
  JSON.stringify({
    name: "客户简称",
    email: "采购邮箱",
    grade: "等级说明",
  }),
);
const mappedParseResponse = await app.request("/api/v1/imports/parse", {
  method: "POST",
  headers: { Authorization: authorization },
  body: mappedForm,
});
const mappedParsed = await mappedParseResponse.json();
const [{ count: customersAfterMappedParse }] = await db
  .select({ count: count() })
  .from(customersTable);
const [{ count: jobsAfterMappedParse }] = await db
  .select({ count: count() })
  .from(import_jobs);

const mappedCommitResponse = await app.request(
  `/api/v1/imports/${mappedParsed.job_id}/commit`,
  {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ job_id: mappedParsed.job_id, resolutions: [] }),
  },
);
const mappedCommitted = await mappedCommitResponse.json();

const missingNameForm = new FormData();
missingNameForm.set("file", mappedFile);
missingNameForm.set("mapping", JSON.stringify({ email: "采购邮箱" }));
const missingNameResponse = await app.request("/api/v1/imports/parse", {
  method: "POST",
  headers: { Authorization: authorization },
  body: missingNameForm,
});
const missingNameError = await missingNameResponse.json();

const duplicateMappingForm = new FormData();
duplicateMappingForm.set("file", mappedFile);
duplicateMappingForm.set(
  "mapping",
  JSON.stringify({ name: "客户简称", email: "客户简称" }),
);
const duplicateMappingResponse = await app.request("/api/v1/imports/parse", {
  method: "POST",
  headers: { Authorization: authorization },
  body: duplicateMappingForm,
});
const duplicateMappingError = await duplicateMappingResponse.json();

console.log(
  JSON.stringify({
    parse_status: parseResponse.status,
    total_rows: parsed.total_rows,
    valid_rows: parsed.valid_rows,
    errors: parsed.errors.length,
    duplicate_candidates: parsed.duplicate_candidates.length,
    preview_customers: previewCustomers,
    preview_jobs: previewJobs,
    errors_before_commit_status: errorsBeforeCommit.status,
    failed_commit_status: failedCommitResponse.status,
    customers_after_rollback: customersAfterRollback,
    jobs_after_rollback: jobsAfterRollback,
    commit_status: commitResponse.status,
    replay_status: replayResponse.status,
    replay_matches: JSON.stringify(replayed) === JSON.stringify(committed),
    jobs_after_replay: jobsAfterReplay,
    ...committed,
    persisted_customers: customers.items.length,
    persisted_timestamps_are_iso: persistedTimestampsAreIso,
    errors_after_commit_status: errorsAfterCommit.status,
    mapped_parse_status: mappedParseResponse.status,
    mapped_valid_rows: mappedParsed.valid_rows,
    mapped_errors: mappedParsed.errors.length,
    mapped_source_columns: mappedParsed.source_columns,
    mapped_preview: mappedParsed.preview[0],
    customers_after_mapped_parse: customersAfterMappedParse,
    jobs_after_mapped_parse: jobsAfterMappedParse,
    mapped_commit_status: mappedCommitResponse.status,
    mapped_commit: mappedCommitted,
    missing_name_status: missingNameResponse.status,
    missing_name_fields: Object.keys(missingNameError.error.fields),
    duplicate_mapping_status: duplicateMappingResponse.status,
    duplicate_mapping_fields: Object.keys(duplicateMappingError.error.fields),
  }),
);
process.exit(0);
