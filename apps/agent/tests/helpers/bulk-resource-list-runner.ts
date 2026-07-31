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
  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }
  return body as any;
}

async function create(path: string, body: Record<string, unknown>) {
  return request(path, { method: "POST", body: JSON.stringify(body) });
}

async function collectPages(path: string) {
  const items: any[] = [];
  const cursors: Array<string | null> = [];
  let cursor: string | undefined;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const page = await request(
      `${path}${separator}limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    items.push(...page.items);
    cursors.push(page.next_cursor);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return { items, cursors };
}

const empty = Object.fromEntries(
  await Promise.all(
    ["contacts", "social-accounts", "risks", "milestones"].map(
      async (resource) => [resource, await request(`${resource}?limit=1`)],
    ),
  ),
);

const invalidLimitResponse = await app.request("/api/v1/contacts?limit=101", {
  headers: { Authorization: authorization },
});
const invalidLimit = {
  status: invalidLimitResponse.status,
  body: await invalidLimitResponse.json(),
};

const customerOne = await create("customers", {
  name: "华东客户",
  grade: "A",
  status: "active",
});
const customerTwo = await create("customers", {
  name: "华南客户",
  grade: "B",
  status: "active",
});

await create(`customers/${customerOne.id}/contacts`, { name: "联系人甲" });
await create(`customers/${customerOne.id}/contacts`, { name: "联系人乙" });
await create(`customers/${customerTwo.id}/contacts`, { name: "联系人丙" });
await create(`customers/${customerOne.id}/social-accounts`, {
  platform: "telegram",
  raw_identifier: "@east_customer",
});
await create(`customers/${customerTwo.id}/social-accounts`, {
  platform: "whatsapp",
  raw_identifier: "+8613800138000",
});

const projectOne = await create("projects", {
  customer_id: customerOne.id,
  name: "华东项目",
  grade: "A",
});
const projectTwo = await create("projects", {
  customer_id: customerTwo.id,
  name: "华南项目",
  grade: "B",
});

await create(`projects/${projectOne.id}/risks`, {
  description: "风险甲",
  severity: "high",
});
await create(`projects/${projectOne.id}/risks`, {
  description: "风险乙",
  severity: "medium",
});
await create(`projects/${projectTwo.id}/risks`, {
  description: "风险丙",
  severity: "low",
});
await create(`projects/${projectOne.id}/milestones`, {
  name: "里程碑甲",
  date: "2026-08-01",
});
await create(`projects/${projectTwo.id}/milestones`, {
  name: "里程碑乙",
  date: "2026-09-01",
});

const pages = {
  contacts: await collectPages("contacts"),
  social_accounts: await collectPages("social-accounts"),
  risks: await collectPages("risks"),
  milestones: await collectPages("milestones"),
};

const filtered = {
  contacts: await request(`contacts?customer_id=${customerOne.id}&limit=100`),
  social_accounts: await request(
    `social-accounts?customer_id=${customerTwo.id}&limit=100`,
  ),
  risks: await request(`risks?project_id=${projectOne.id}&limit=100`),
  milestones: await request(`milestones?project_id=${projectTwo.id}&limit=100`),
};

console.log(
  JSON.stringify({
    empty,
    invalid_limit: invalidLimit,
    pages,
    filtered,
    parent_ids: {
      customer_one: customerOne.id,
      customer_two: customerTwo.id,
      project_one: projectOne.id,
      project_two: projectTwo.id,
    },
  }),
);

process.exit(0);
