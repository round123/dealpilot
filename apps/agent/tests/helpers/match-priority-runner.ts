import { config } from "../../src/config/config";
import { db } from "../../src/db/client";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
import { contacts, customers, social_accounts } from "../../src/db/schema";
import { createApp } from "../../src/server";

runMigrations();
ensureSchema();

const now = new Date().toISOString();
const ids = {
  manual: "10000000-0000-4000-8000-000000000001",
  phoneA: "10000000-0000-4000-8000-000000000002",
  phoneB: "10000000-0000-4000-8000-000000000003",
  username: "10000000-0000-4000-8000-000000000004",
};
await db.insert(customers).values([
  { id: ids.manual, name: "人工绑定客户", grade: "A", status: "active", created_at: now, updated_at: now },
  { id: ids.phoneA, name: "手机号客户 A", grade: "B", status: "active", created_at: now, updated_at: now },
  { id: ids.phoneB, name: "手机号客户 B", grade: "C", status: "active", created_at: now, updated_at: now },
  { id: ids.username, name: "用户名客户", grade: "A", status: "active", created_at: now, updated_at: now },
]);
await db.insert(contacts).values([
  { customer_id: ids.phoneA, name: "联系人 A", phone: "+8613800001234", created_at: now },
  { customer_id: ids.phoneB, name: "联系人 B1", phone: "+8613800001234", created_at: now },
  { customer_id: ids.phoneB, name: "联系人 B2", phone: "+8613800001234", created_at: now },
]);
await db.insert(social_accounts).values({
  customer_id: ids.username,
  platform: "telegram",
  raw_identifier: "@Exact_User",
  normalized_identifier: "exact_user",
  manually_bound: false,
  created_at: now,
});

const app = createApp();
const authorization = `Bearer ${config.token}`;
async function request(path: string, method = "POST", body?: unknown) {
  const response = await app.request(`/api/v1/${path}`, {
    method,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...(method !== "GET" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: response.status === 204 ? undefined : await response.json() as any,
  };
}

const whatsappIdentifier = "+86 (138) 0000-1234@c.us";
await request("matches/bind", "POST", {
  platform: "whatsapp",
  raw_identifier: whatsappIdentifier,
  customer_id: ids.manual,
});
const manual = await request("matches/resolve", "POST", {
  platform: "whatsapp",
  raw_identifier: whatsappIdentifier,
});
await request("matches/bind", "DELETE", {
  platform: "whatsapp",
  raw_identifier: whatsappIdentifier,
});
const phone = await request("matches/resolve", "POST", {
  platform: "whatsapp",
  raw_identifier: whatsappIdentifier,
});
const username = await request("matches/resolve", "POST", {
  platform: "telegram",
  raw_identifier: "@EXACT_USER",
});
const none = await request("matches/resolve", "POST", {
  platform: "telegram",
  raw_identifier: "@missing_user",
});

console.log(JSON.stringify({ manual: manual.body, phone: phone.body, username: username.body, none: none.body, ids }));
process.exit(0);
