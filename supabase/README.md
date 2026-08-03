# DealPilot Supabase baseline

This directory derives its CRM vocabulary and local Supabase layout from
[marmelab/atomic-crm](https://github.com/marmelab/atomic-crm) at commit
`167a4cdb652b1ab2b4b030831cfa7adcf2099321` (MIT).

DealPilot intentionally does not copy Atomic CRM's organization-wide RLS
policies. Every business record belongs to `owner_user_id`, all authenticated
access is checked against `auth.uid()`, and parent/child relationships include
the owner in their foreign keys.

The private `attachments` bucket follows the same rule. Object names must start
with the authenticated user ID (`<auth.uid()>/<object path>`); paths without
that prefix are rejected by Storage RLS.

The first migration is a clean-database baseline. Verify it locally with:

```powershell
supabase start
supabase db reset
psql postgres://postgres:postgres@127.0.0.1:54322/postgres `
  -v ON_ERROR_STOP=1 `
  -f supabase/tests/schema_security.sql
psql postgres://postgres:postgres@127.0.0.1:54322/postgres `
  -v ON_ERROR_STOP=1 `
  -f supabase/tests/personal_isolation.sql
```

Both SQL checks are transactional and leave no fixture data behind.
`schema_security.sql` inspects PostgreSQL catalogs for schema drift in RLS,
owner columns and policies, parent/child foreign keys, scoped unique indexes,
function grants, anonymous access, and Storage policies. The behavioral
`personal_isolation.sql` check covers two-user RLS isolation, forged ownership,
cross-owner foreign keys, and the customer soft-delete, restore, and merge
RPCs. It also verifies that a reminder edited after customer deletion is not
overwritten during restore.

`schema_security.sql` also runs `backup_isolation.sql`. That gate verifies
owner-only snapshot visibility, denied direct writes, checksum-protected
transactional restore, automatic safety snapshots, and preservation of
append-only audit history. Account snapshots contain relational CRM data and
user settings only; Auth credentials, Storage binaries, operational queues and
audit events are deliberately excluded. The product does not accept V1 SQLite
databases or migration bundles.

Customer command and detail RPCs return a single success envelope:
`{"data": ...}`. `get_customer_detail` includes contacts, social accounts,
deals, the 10 most recent follow-ups, and open reminders. Missing, deleted, or
cross-owner customers use SQLSTATE `P0002`; the API client is responsible for
normalizing PostgREST errors.

## Cloud deployment

`.github/workflows/deploy-cloud.yml` deploys this directory to a linked
Supabase project before publishing the Web/PWA artifact to GitHub Pages. The
workflow intentionally fails when any required value is missing; production
must never fall back to the browser-only demo provider.

Configure these GitHub repository secrets:

- `SUPABASE_ACCESS_TOKEN`: a scoped Supabase personal access token used only by
  the deployment job.
- `SUPABASE_DB_PASSWORD`: the production project's database password.
- `SUPABASE_PROJECT_REF`: the production project reference.
- `VITE_SUPABASE_URL`: the production project API URL.
- `VITE_SB_PUBLISHABLE_KEY`: the project's public publishable/anon key.

GitHub Pages hosts only the static Web/PWA files. PostgreSQL, Auth, Storage and
Edge Functions continue to run in Supabase; GitHub Actions is only the release
runner and is not treated as an application server.

Customers remain restorable for 30 days. Expired deletion uses a durable queue:

1. `purge_expired_customers` snapshots every referenced attachment path into
   `customer_purge_jobs`; despite its compatibility name, this RPC only queues.
2. The `purge-expired-customers` Edge Function leases jobs and removes Storage
   objects in replay-safe batches.
3. `complete_customer_purge_job` locks every path-bearing row and takes a final
   snapshot. New paths move the job back to `retry`; a stable snapshot allows
   the Customer delete and relational FK cascades to commit atomically.
4. Storage or RPC failures keep the Customer and queue row, record the error,
   and retry with bounded exponential backoff. Completed queue rows remain as
   operational evidence and are never reclaimed.

The queue deliberately has no Customer foreign key, so its object paths and
retry state survive the cascade. It has forced RLS, no policies, and no direct
table grants. The queue RPCs are `SECURITY DEFINER`, use an empty search path,
and are executable only by `service_role`. Browser roles cannot queue, claim,
complete, fail, or inspect cleanup jobs.

Run the Edge authorization tests and deploy with:

```powershell
deno test supabase/functions/purge-expired-customers/auth.test.ts
node --experimental-strip-types --test `
  supabase/functions/purge-expired-customers/handler.test.ts
supabase functions deploy purge-expired-customers
```

The handler test uses an injected in-memory client and never sends a network
request. It covers method and role rejection, invalid request input, sanitized
internal failures, and request ID propagation.

The production schedule is defined in
`.github/workflows/purge-expired-customers.yml` and runs daily. Configure
`SUPABASE_SERVICE_ROLE_KEY` only in the protected `cloud-production` GitHub
environment; the workflow reads the existing `VITE_SUPABASE_URL` from the same
environment. Never place the service-role token in a migration, request body,
response, artifact, or log. The function must retain `verify_jwt = true`: the
Edge gateway verifies the signature, then the function rejects any JWT whose
role is not `service_role` before constructing its service client. A Supabase
Cron/Vault schedule may replace GitHub Actions later, but both schedulers must
not be enabled at the same time.

The optional body accepts `cutoff`, `enqueue_limit` (1-500), and `claim_limit`
(1-100). An empty JSON body uses the 30-day cutoff and bounded defaults. Cron
overlap is safe because enqueue is unique by Customer and claims use row locks
with `SKIP LOCKED`; abandoned leases become claimable again after 15 minutes.
