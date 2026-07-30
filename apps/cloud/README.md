# DealPilot Cloud

DealPilot Cloud is derived from Atomic CRM and is the V2 Web/PWA application.
See `UPSTREAM.md` and `LICENSE.md` for the pinned upstream revision and license.

## Local UI mode

Use the in-memory data provider when working on layout and interactions without
Docker. Data is synthetic and resets when the page reloads.

```powershell
pnpm --filter @dealpilot/cloud dev:demo
```

## Local Supabase mode

Docker Desktop or Podman must be running before starting the local Supabase
stack. Only synthetic or irreversibly anonymized data may be used.

```powershell
pnpm dlx supabase@2.110.0 start
pnpm dlx supabase@2.110.0 db reset
pnpm --filter @dealpilot/cloud dev
```

Run the database security checks against the local stack:

```powershell
psql postgres://postgres:postgres@127.0.0.1:54322/postgres `
  -v ON_ERROR_STOP=1 `
  -f supabase/tests/schema_security.sql
psql postgres://postgres:postgres@127.0.0.1:54322/postgres `
  -v ON_ERROR_STOP=1 `
  -f supabase/tests/personal_isolation.sql
```

The Supabase mode is not accepted until migrations, two-user isolation,
Storage policies, and Customer RPC tests pass against a running PostgreSQL
instance. Static SQL parsing does not replace that gate.
