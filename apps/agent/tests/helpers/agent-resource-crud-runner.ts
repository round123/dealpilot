import { config } from "../../src/config/config";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { createApp } from "../../src/server";

runMigrations();
ensureSchema();

const app = createApp();
const authorization = `Bearer ${config.token}`;

async function request(path: string, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Authorization", authorization);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (method !== "GET" && method !== "HEAD") {
    headers.set("Idempotency-Key", crypto.randomUUID());
  }

  const response = await app.request(`/api/v1/${path}`, { ...init, headers });
  const body = response.status === 204 ? undefined : await response.json();
  return { response, body: body as any };
}

const customer = await request("customers", {
  method: "POST",
  body: JSON.stringify({ name: "本地回收站客户", grade: "A", status: "active" }),
});
const customerId = customer.body.id as string;

const project = await request("projects", {
  method: "POST",
  body: JSON.stringify({ customer_id: customerId, name: "完整 CRUD 项目", grade: "A" }),
});
const projectId = project.body.id as string;

const invalidRisk = await request(`projects/${projectId}/risks`, {
  method: "POST",
  body: JSON.stringify({ description: "", severity: "not-valid" }),
});

const handledAt = "2026-07-30T08:00:00.000Z";
const riskCreated = await request(`projects/${projectId}/risks`, {
  method: "POST",
  body: JSON.stringify({
    description: "初始风险",
    severity: "high",
    status: "resolved",
    handled_at: handledAt,
  }),
});
const riskId = riskCreated.body.id as string;
const riskUpdated = await request(`risks/${riskId}`, {
  method: "PUT",
  body: JSON.stringify({
    description: "已更新风险",
    severity: "medium",
    status: "handling",
    handled_at: null,
  }),
});
const riskDeleted = await request(`risks/${riskId}`, { method: "DELETE" });

const milestoneCreated = await request(`projects/${projectId}/milestones`, {
  method: "POST",
  body: JSON.stringify({
    name: "初始里程碑",
    date: "2026-08-15",
    completed: true,
  }),
});
const milestoneId = milestoneCreated.body.id as string;
const milestoneUpdated = await request(`milestones/${milestoneId}`, {
  method: "PUT",
  body: JSON.stringify({
    name: "已更新里程碑",
    date: "2026-08-20",
    completed: false,
  }),
});
const milestoneDeleted = await request(`milestones/${milestoneId}`, {
  method: "DELETE",
});

const projectAfterDeletes = await request(`projects/${projectId}`);

const customerDeleted = await request(`customers/${customerId}`, {
  method: "DELETE",
});
const deletedPage = await request("customers/deleted?limit=20");
const customerRestored = await request(`customers/${customerId}/restore`, {
  method: "POST",
  body: JSON.stringify({}),
});
const deletedAfterRestore = await request("customers/deleted?limit=20");

console.log(JSON.stringify({
  validation: {
    status: invalidRisk.response.status,
    code: invalidRisk.body.error?.code,
    fields: invalidRisk.body.error?.fields,
  },
  risk: {
    create_status: riskCreated.response.status,
    created: riskCreated.body,
    update_status: riskUpdated.response.status,
    updated: riskUpdated.body,
    delete_status: riskDeleted.response.status,
  },
  milestone: {
    create_status: milestoneCreated.response.status,
    created: milestoneCreated.body,
    update_status: milestoneUpdated.response.status,
    updated: milestoneUpdated.body,
    delete_status: milestoneDeleted.response.status,
  },
  project_after_deletes: {
    risks: projectAfterDeletes.body.risks,
    milestones: projectAfterDeletes.body.milestones,
  },
  deleted_customers: {
    delete_status: customerDeleted.response.status,
    listed_ids: deletedPage.body.items.map((item: any) => item.id),
    restore_status: customerRestored.response.status,
    listed_after_restore: deletedAfterRestore.body.items.map((item: any) => item.id),
  },
}));

process.exit(0);
