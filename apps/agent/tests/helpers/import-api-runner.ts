import { config } from "../../src/config/config";
import { ensureSchema, runMigrations } from "../../src/db/migrate";
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
if (!parseResponse.ok) throw new Error(`parse failed: ${JSON.stringify(parsed)}`);

const commitResponse = await app.request(`/api/v1/imports/${parsed.job_id}/commit`, {
  method: "POST",
  headers: {
    Authorization: authorization,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({ job_id: parsed.job_id, resolutions: [] }),
});
const committed = await commitResponse.json();
if (!commitResponse.ok) throw new Error(`commit failed: ${JSON.stringify(committed)}`);

const customersResponse = await app.request("/api/v1/customers?search=Phase4&limit=20", {
  headers: { Authorization: authorization },
});
const customers = await customersResponse.json();
if (!customersResponse.ok) throw new Error(`customer verification failed: ${JSON.stringify(customers)}`);

console.log(JSON.stringify({
  parse_status: parseResponse.status,
  total_rows: parsed.total_rows,
  valid_rows: parsed.valid_rows,
  errors: parsed.errors.length,
  duplicate_candidates: parsed.duplicate_candidates.length,
  commit_status: commitResponse.status,
  ...committed,
  persisted_customers: customers.items.length,
}));
process.exit(0);
