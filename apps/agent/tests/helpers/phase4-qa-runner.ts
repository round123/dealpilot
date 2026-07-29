import { config } from "../../src/config/config";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { getRawDb } from "../../src/db/client";
import { createApp } from "../../src/server";
import { runMilestoneReminderSweep } from "../../src/services/milestone-service";

runMigrations();
ensureSchema();
const app = createApp();
const raw = getRawDb();
const authorization = `Bearer ${config.token}`;

async function jsonRequest(path: string, init: RequestInit = {}) {
  const response = await app.request(path, {
    ...init,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body: body as any };
}

function p95(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}

const csv = ["name,company,country,source,grade,contact_name,email,phone"];
for (let index = 1; index <= 1000; index++) {
  const value = String(index).padStart(4, "0");
  csv.push(`QA Customer ${value},QA Company ${value},CN,Phase4,B,Contact ${value},qa${value}@example.com,+86138${String(index).padStart(8, "0")}`);
}
const importStarted = performance.now();
const form = new FormData();
form.append("file", new File([csv.join("\n")], "phase4-1000.csv", { type: "text/csv" }));
const parseResponse = await app.request("/api/v1/imports/parse", {
  method: "POST",
  headers: { Authorization: authorization },
  body: form,
});
const parsed = await parseResponse.json() as any;
const committed = await jsonRequest(`/api/v1/imports/${parsed.job_id}/commit`, {
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ job_id: parsed.job_id, resolutions: [] }),
});
const importDurationMs = performance.now() - importStarted;

const searchSamples: number[] = [];
for (let index = 0; index < 30; index++) {
  const started = performance.now();
  const result = await jsonRequest("/api/v1/customers?search=QA%20Customer%200500&limit=20");
  if (result.response.status !== 200 || result.body.items.length !== 1) {
    throw new Error(`Search QA failed: ${JSON.stringify(result.body)}`);
  }
  searchSamples.push(performance.now() - started);
}

const customerResult = await jsonRequest("/api/v1/customers?search=QA%20Customer%200001&limit=1");
const customerId = customerResult.body.items[0].id as string;
const bindResult = await jsonRequest("/api/v1/matches/bind", {
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ platform: "whatsapp", raw_identifier: "+8613800000001", customer_id: customerId }),
});
const matchSamples: number[] = [];
for (let index = 0; index < 30; index++) {
  const started = performance.now();
  const result = await jsonRequest("/api/v1/matches/resolve", {
    method: "POST",
    body: JSON.stringify({ platform: "whatsapp", raw_identifier: "+8613800000001" }),
  });
  if (result.body.status !== "unique" || result.body.customer.id !== customerId) {
    throw new Error(`Match QA failed: ${JSON.stringify(result.body)}`);
  }
  matchSamples.push(performance.now() - started);
}

const duplicateForm = new FormData();
duplicateForm.append("file", new File(["name,grade\nQA Customer 0001,B"], "duplicate.csv"));
const duplicateParseResponse = await app.request("/api/v1/imports/parse", {
  method: "POST",
  headers: { Authorization: authorization },
  body: duplicateForm,
});
const duplicateParsed = await duplicateParseResponse.json() as any;
const unresolvedDuplicate = await jsonRequest(`/api/v1/imports/${duplicateParsed.job_id}/commit`, {
  method: "POST",
  body: JSON.stringify({ job_id: duplicateParsed.job_id, resolutions: [] }),
});
const resolvedDuplicate = await jsonRequest(`/api/v1/imports/${duplicateParsed.job_id}/commit`, {
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({
    job_id: duplicateParsed.job_id,
    resolutions: [{ row_index: 1, action: "skip" }],
  }),
});

const source = await jsonRequest("/api/v1/customers", {
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ name: "Merge Source", grade: "B", status: "active" }),
});
const target = await jsonRequest("/api/v1/customers", {
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ name: "Merge Target", grade: "A", status: "active" }),
});
const sourceId = source.body.id as string;
const targetId = target.body.id as string;
const now = new Date().toISOString();
raw.query("INSERT INTO follow_ups (id, customer_id, type, note, occurred_at, created_at) VALUES (?, ?, 'note', 'merge', ?, ?)")
  .run(crypto.randomUUID(), sourceId, now, now);
const projectId = crypto.randomUUID();
raw.query("INSERT INTO projects (id, customer_id, name, currency, stage, grade, created_at, updated_at) VALUES (?, ?, 'Merge Project', 'USD', 'lead', 'A', ?, ?)")
  .run(projectId, sourceId, now, now);
raw.query("INSERT INTO reminders (id, customer_id, project_id, type, status, due_at, priority, created_at, updated_at) VALUES (?, ?, ?, 'fixed_time', 'pending', ?, 'normal', ?, ?)")
  .run(crypto.randomUUID(), sourceId, projectId, now, now, now);
raw.query("INSERT INTO social_accounts (id, customer_id, platform, raw_identifier, normalized_identifier, manually_bound, created_at) VALUES (?, ?, 'telegram', '@merge-source', 'merge-source', 0, ?)")
  .run(crypto.randomUUID(), sourceId, now);
const merged = await jsonRequest("/api/v1/customers/merge", {
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
});
const mergedCounts = {
  follow_ups: (raw.query("SELECT COUNT(*) AS count FROM follow_ups WHERE customer_id = ?").get(targetId) as any).count,
  projects: (raw.query("SELECT COUNT(*) AS count FROM projects WHERE customer_id = ?").get(targetId) as any).count,
  reminders: (raw.query("SELECT COUNT(*) AS count FROM reminders WHERE customer_id = ?").get(targetId) as any).count,
  social_accounts: (raw.query("SELECT COUNT(*) AS count FROM social_accounts WHERE customer_id = ?").get(targetId) as any).count,
};

const stageResult = await jsonRequest(`/api/v1/projects/${projectId}/stage`, {
  method: "PUT",
  body: JSON.stringify({ stage: "qualified" }),
});
const stageEvents = (raw.query("SELECT COUNT(*) AS count FROM local_events WHERE event_type = 'project.stage_changed' AND entity_id = ?").get(projectId) as any).count;

const milestoneDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
await jsonRequest(`/api/v1/projects/${projectId}/milestones`, {
  method: "POST",
  body: JSON.stringify({ name: "QA milestone", date: milestoneDate }),
});
const milestoneRemindersCreated = await runMilestoneReminderSweep(new Date());

const followUpKey = crypto.randomUUID();
const followUpBody = JSON.stringify({
  customer_id: targetId,
  type: "note",
  note: "idempotency QA",
  occurred_at: now,
});
const firstFollowUp = await jsonRequest("/api/v1/follow-ups", {
  method: "POST",
  headers: { "Idempotency-Key": followUpKey },
  body: followUpBody,
});
const secondFollowUp = await jsonRequest("/api/v1/follow-ups", {
  method: "POST",
  headers: { "Idempotency-Key": followUpKey },
  body: followUpBody,
});
const idempotentRows = (raw.query("SELECT COUNT(*) AS count FROM follow_ups WHERE note = 'idempotency QA'").get() as any).count;

const unauthorized = await app.request("/api/v1/customers");
const forbiddenOrigin = await app.request("/api/v1/customers", {
  headers: { Authorization: authorization, Origin: "https://evil.example" },
});

console.log(JSON.stringify({
  import_1000: {
    parse_status: parseResponse.status,
    commit_status: committed.response.status,
    parsed_rows: parsed.total_rows,
    imported_rows: committed.body.success,
    duration_ms: Number(importDurationMs.toFixed(2)),
  },
  customer_search_p95_ms: Number(p95(searchSamples).toFixed(2)),
  match: {
    bind_status: bindResult.response.status,
    p95_ms: Number(p95(matchSamples).toFixed(2)),
  },
  duplicate: {
    candidates: duplicateParsed.duplicate_candidates.length,
    unresolved_status: unresolvedDuplicate.response.status,
    resolved_status: resolvedDuplicate.response.status,
    skipped: resolvedDuplicate.body.skipped,
  },
  merge: { status: merged.response.status, counts: mergedCounts },
  stage: { status: stageResult.response.status, value: stageResult.body.stage, events: stageEvents },
  milestone_reminders_created: milestoneRemindersCreated,
  idempotency: {
    first_status: firstFollowUp.response.status,
    second_status: secondFollowUp.response.status,
    same_id: firstFollowUp.body.id === secondFollowUp.body.id,
    rows: idempotentRows,
  },
  security: { unauthorized: unauthorized.status, forbidden_origin: forbiddenOrigin.status },
}));

process.exit(0);
