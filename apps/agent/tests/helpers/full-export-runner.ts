import * as XLSX from "xlsx";

import { config } from "../../src/config/config";
import { db } from "../../src/db/client";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import {
  contacts,
  customers,
  follow_ups,
  milestones,
  projects,
  reminders,
  risks,
  social_accounts,
} from "../../src/db/schema";
import { createApp } from "../../src/server";

runMigrations();
ensureSchema();

const customerId = "11111111-1111-4111-8111-111111111111";
const contactId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";

await db.insert(customers).values({
  id: customerId,
  name: "全域导出客户",
  grade: "A",
  status: "active",
});
await db.insert(contacts).values({
  id: contactId,
  customer_id: customerId,
  name: "联系人甲",
});
await db.insert(social_accounts).values({
  customer_id: customerId,
  contact_id: contactId,
  platform: "whatsapp",
  raw_identifier: "+8613800000000",
  normalized_identifier: "+8613800000000",
});
await db.insert(projects).values({
  id: projectId,
  customer_id: customerId,
  name: "年度采购",
  stage: "proposal",
  grade: "A",
});
await db.insert(follow_ups).values({
  customer_id: customerId,
  project_id: projectId,
  type: "call",
  note: "确认预算",
  occurred_at: "2026-07-30T08:00:00.000Z",
});
await db.insert(reminders).values({
  customer_id: customerId,
  project_id: projectId,
  type: "fixed_time",
  due_at: "2026-08-01T08:00:00.000Z",
});
await db.insert(risks).values({
  project_id: projectId,
  description: "交期风险",
  severity: "high",
});
await db.insert(milestones).values({
  project_id: projectId,
  name: "确认样品",
  date: "2026-08-15",
});

const app = createApp();
const response = await app.request("/api/v1/exports/all", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${config.token}`,
    "Idempotency-Key": crypto.randomUUID(),
  },
});
const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });

console.log(JSON.stringify({
  status: response.status,
  content_type: response.headers.get("content-type"),
  disposition: response.headers.get("content-disposition"),
  sheets: workbook.SheetNames,
  customer_name: workbook.Sheets["客户"]?.B2?.v,
}));

process.exit(0);
