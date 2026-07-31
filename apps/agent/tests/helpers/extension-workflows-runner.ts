import { config } from "../../src/config/config";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { createApp } from "../../src/server";

runMigrations();
ensureSchema();

const app = createApp();
const authorization = `Bearer ${config.token}`;

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authorization);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if ((init.method ?? "GET").toUpperCase() !== "GET") {
    headers.set("Idempotency-Key", crypto.randomUUID());
  }
  const response = await app.request(`/api/v1/${path}`, { ...init, headers });
  const body = response.status === 204 ? undefined : await response.json();
  return { status: response.status, body: body as any };
}

const customer = await request("customers", {
  method: "POST",
  body: JSON.stringify({ name: "Extension Search Customer", company: "远航贸易", grade: "A" }),
});
const secondCustomer = await request("customers", {
  method: "POST",
  body: JSON.stringify({ name: "Extension Rebind Customer", grade: "B" }),
});
const customerId = customer.body.id as string;
const secondCustomerId = secondCustomer.body.id as string;

const search = await request("customers?search=%E8%BF%9C%E8%88%AA%E8%B4%B8%E6%98%93&limit=10&sort=name");
const identifier = "+86 138-0000-4321";
const bind = await request("matches/bind", {
  method: "POST",
  body: JSON.stringify({ platform: "whatsapp", raw_identifier: identifier, customer_id: customerId }),
});

const project = await request("projects", {
  method: "POST",
  body: JSON.stringify({ customer_id: customerId, name: "高风险履约项目", grade: "C" }),
});
await request(`projects/${project.body.id}/risks`, {
  method: "POST",
  body: JSON.stringify({ description: "交付时间可能延误", severity: "critical", status: "open" }),
});
await request("reminders", {
  method: "POST",
  body: JSON.stringify({
    customer_id: customerId,
    project_id: project.body.id,
    type: "fixed_time",
    due_at: "2099-08-01T09:00:00.000Z",
    priority: "low",
  }),
});
const popup = await request("reminders/popup");

const rebind = await request("matches/bind", {
  method: "POST",
  body: JSON.stringify({ platform: "whatsapp", raw_identifier: identifier, customer_id: secondCustomerId }),
});
const resolvedAfterRebind = await request("matches/resolve", {
  method: "POST",
  body: JSON.stringify({ platform: "whatsapp", raw_identifier: identifier }),
});
const unbind = await request("matches/bind", {
  method: "DELETE",
  body: JSON.stringify({ platform: "whatsapp", raw_identifier: identifier }),
});
const resolvedAfterUnbind = await request("matches/resolve", {
  method: "POST",
  body: JSON.stringify({ platform: "whatsapp", raw_identifier: identifier }),
});

console.log(JSON.stringify({
  search: {
    status: search.status,
    ids: search.body.items.map((item: { id: string }) => item.id),
  },
  bind_status: bind.status,
  popup: popup.body,
  rebind: {
    status: rebind.status,
    customer_id: resolvedAfterRebind.body.customer?.id,
  },
  unbind: {
    status: unbind.status,
    match_status: resolvedAfterUnbind.body.status,
  },
}));

process.exit(0);
