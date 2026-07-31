import { and, count, eq } from "drizzle-orm";
import { config } from "../../src/config/config";
import { db } from "../../src/db/client";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import {
  contacts,
  customers,
  import_jobs,
  social_accounts,
} from "../../src/db/schema";
import { createApp } from "../../src/server";

runMigrations();
ensureSchema();
const now = new Date().toISOString();
const exactCustomerId = "11111111-1111-4111-8111-111111111111";
const hintCustomerId = "22222222-2222-4222-8222-222222222222";

await db.insert(customers).values([
  {
    id: exactCustomerId,
    name: "现有客户",
    company: "现有公司",
    country: "中国",
    source: null,
    grade: "A",
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: hintCustomerId,
    name: "名称提示客户",
    company: "同名公司",
    country: null,
    source: null,
    grade: "B",
    status: "active",
    created_at: now,
    updated_at: now,
  },
]);
await db.insert(contacts).values({
  customer_id: exactCustomerId,
  name: "现有联系人",
  email: "Buyer@Example.com",
  phone: "+8613800138000",
  created_at: now,
});
await db.insert(social_accounts).values({
  customer_id: exactCustomerId,
  platform: "telegram",
  raw_identifier: "@Buyer",
  normalized_identifier: "buyer",
  manually_bound: false,
  created_at: now,
});

const csv = [
  "name,company,country,source,grade,contact_name,email,phone,platform,platform_account",
  "导入客户,导入公司,美国,展会,B,新联系人,BUYER@EXAMPLE.COM,+86 138-0013-8000,telegram,@buyer",
  "名称提示客户,同名公司,,,B,,,,,",
].join("\n");
const app = createApp();
const headers = { Authorization: `Bearer ${config.token}` };
async function parseCsv() {
  const formData = new FormData();
  formData.set("file", new File([csv], "dedup.csv", { type: "text/csv" }));
  const response = await app.request("/api/v1/imports/parse", {
    method: "POST",
    headers,
    body: formData,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return { response, result };
}

async function commitCandidate(parsed: any) {
  const candidate = parsed.duplicate_candidates[0];
  const match = candidate.matches[0];
  return app.request(`/api/v1/imports/${parsed.job_id}/commit`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      job_id: parsed.job_id,
      resolutions: [
        {
          row_index: candidate.row_index,
          action: "merge",
          target_customer_id: match.existing_customer_id,
        },
      ],
    }),
  });
}

const { response: staleParseResponse, result: staleParsed } = await parseCsv();
const forgedTargetResponse = await app.request(
  `/api/v1/imports/${staleParsed.job_id}/commit`,
  {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      job_id: staleParsed.job_id,
      resolutions: [
        {
          row_index: staleParsed.duplicate_candidates[0].row_index,
          action: "merge",
          target_customer_id: hintCustomerId,
        },
      ],
    }),
  },
);
await db
  .update(customers)
  .set({ deleted_at: new Date().toISOString() })
  .where(eq(customers.id, exactCustomerId));
const staleCommitResponse = await commitCandidate(staleParsed);
const [{ count: jobsAfterStaleCommit }] = await db
  .select({ count: count() })
  .from(import_jobs);
await db
  .update(customers)
  .set({ deleted_at: null })
  .where(eq(customers.id, exactCustomerId));

const { response: parseResponse, result: parsed } = await parseCsv();

const candidate = parsed.duplicate_candidates[0];
const match = candidate.matches[0];
const commitResponse = await commitCandidate(parsed);
const committed = await commitResponse.json();
if (!commitResponse.ok) throw new Error(JSON.stringify(committed));

const platformNewForm = new FormData();
platformNewForm.set(
  "file",
  new File(
    [
      "name,contact_name,email,platform,platform_account\n" +
        "平台账号新客户,新联系人,new-platform@example.com,telegram,@buyer\n",
    ],
    "platform-new.csv",
    { type: "text/csv" },
  ),
);
const platformNewParseResponse = await app.request("/api/v1/imports/parse", {
  method: "POST",
  headers,
  body: platformNewForm,
});
const platformNewParsed = await platformNewParseResponse.json();
const platformNewCandidate = platformNewParsed.duplicate_candidates[0];
const platformNewCommitResponse = await app.request(
  `/api/v1/imports/${platformNewParsed.job_id}/commit`,
  {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      job_id: platformNewParsed.job_id,
      resolutions: [
        { row_index: platformNewCandidate.row_index, action: "new" },
      ],
    }),
  },
);
const platformNewCommitted = await platformNewCommitResponse.json();
if (!platformNewCommitResponse.ok) {
  throw new Error(JSON.stringify(platformNewCommitted));
}
const [platformNewCustomer] = await db
  .select()
  .from(customers)
  .where(eq(customers.name, "平台账号新客户"));
const [{ count: platformNewContacts }] = await db
  .select({ count: count() })
  .from(contacts)
  .where(eq(contacts.customer_id, platformNewCustomer.id));
const [{ count: platformNewAccounts }] = await db
  .select({ count: count() })
  .from(social_accounts)
  .where(eq(social_accounts.customer_id, platformNewCustomer.id));

const [preserved] = await db
  .select()
  .from(customers)
  .where(eq(customers.id, exactCustomerId));
const [preservedContact] = await db
  .select()
  .from(contacts)
  .where(eq(contacts.customer_id, exactCustomerId));
const createdHintOnly = await db
  .select()
  .from(customers)
  .where(
    and(eq(customers.name, "名称提示客户"), eq(customers.company, "同名公司")),
  );

console.log(
  JSON.stringify({
    parse_status: parseResponse.status,
    stale_parse_status: staleParseResponse.status,
    forged_target_status: forgedTargetResponse.status,
    stale_commit_status: staleCommitResponse.status,
    jobs_after_stale_commit: jobsAfterStaleCommit,
    duplicate_rows: parsed.duplicate_candidates.length,
    matched_by: match.matched_by,
    conflict_fields: match.conflicts.map(
      (conflict: { field: string }) => conflict.field,
    ),
    hint_rows: parsed.name_company_hints.length,
    hint_matched_by: parsed.name_company_hints[0].matched_by,
    commit_status: commitResponse.status,
    success: committed.success,
    duplicates: committed.duplicates,
    preserved_name: preserved?.name,
    preserved_company: preserved?.company,
    preserved_country: preserved?.country,
    filled_source: preserved?.source,
    preserved_contact_name: preservedContact?.name,
    created_hint_only_customer: createdHintOnly.some(
      ({ id }) => id !== hintCustomerId,
    ),
    platform_new_status: platformNewCommitResponse.status,
    platform_new_success: platformNewCommitted.success,
    platform_new_contacts: platformNewContacts,
    platform_new_accounts: platformNewAccounts,
    platform_new_warning: platformNewCommitted.warnings[0],
  }),
);
process.exit(0);
