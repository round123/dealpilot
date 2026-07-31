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
  body: JSON.stringify({ name: "Contract Customer", grade: "A", status: "active" }),
});
const project = await request("projects", {
  method: "POST",
  body: JSON.stringify({
    customer_id: customer.body.id,
    name: "Contract Project",
    grade: "A",
    closed_reason: "Initial reason",
  }),
});
const updated = await request(`projects/${project.body.id}`, {
  method: "PUT",
  body: JSON.stringify({ closed_reason: "Updated reason" }),
});
const handledAt = "2026-07-29T08:00:00.000Z";
const risk = await request(`projects/${project.body.id}/risks`, {
  method: "POST",
  body: JSON.stringify({
    description: "Approval pending",
    severity: "high",
    status: "resolved",
    handled_at: handledAt,
  }),
});
const milestone = await request(`projects/${project.body.id}/milestones`, {
  method: "POST",
  body: JSON.stringify({
    name: "Sign contract",
    date: "2026-08-15",
    completed: true,
  }),
});
const detail = await request(`projects/${project.body.id}`);
const archived = await request(`projects/${project.body.id}`, {
  method: "DELETE",
  body: JSON.stringify({ reason: "Archived locally" }),
});
const reloadedArchive = await request(`projects/${project.body.id}`);

console.log(JSON.stringify({
  project: {
    create_status: project.response.status,
    created_reason: project.body.closed_reason,
    update_status: updated.response.status,
    updated_reason: updated.body.closed_reason,
  },
  detail: {
    risk: detail.body.risks.find((item: any) => item.id === risk.body.id),
    milestone: detail.body.milestones.find((item: any) => item.id === milestone.body.id),
  },
  archive: {
    status: archived.response.status,
    stage: reloadedArchive.body.stage,
    reason: reloadedArchive.body.closed_reason,
  },
}));

process.exit(0);
