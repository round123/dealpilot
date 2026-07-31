# DealPilot Cloud

DealPilot Cloud is derived from Atomic CRM and is the V2 Web/PWA application.
See `UPSTREAM.md` and `LICENSE.md` for the pinned upstream revision and license.

## Local UI mode

Use the local data provider when working on product behavior without Docker.
Data is synthetic and is stored in browser localStorage, so Customer and other
Atomic CRM changes survive a page reload. This mode is for local development
and acceptance testing, not production data.

The local UI currently includes the Chinese dashboard, Customer lifecycle,
projects, follow-ups, reminders, project risks, and milestones. Milestones
create a reminder three days before their due date, and unresolved risks gain
priority weight after seven days. The same responsive UI is used on desktop
and mobile viewports.

```powershell
pnpm --filter @dealpilot/cloud dev:demo
```

Reset the synthetic database from the browser console when a clean seed is
needed:

```javascript
localStorage.removeItem('dealpilot.demo-data');
location.reload();
```

This demo does not replace the local Agent or SQLite.

## Local Agent and SQLite mode

Run the Agent API and Atomic frontend in separate terminals. The Agent command
allows only the Atomic development origin and disables tray and Native
Messaging registration for this development session.
The browser calls the same Vite origin; Vite proxies `/api` to the Agent, so no
Agent API URL is embedded in the frontend bundle.

```powershell
pnpm --filter @dealpilot/agent dev:cloud
pnpm --filter @dealpilot/cloud dev:agent
```

After both processes are running, `dev:cloud` opens
`http://127.0.0.1:5173/?token=...#/` automatically. The token is never printed;
the frontend captures it in session storage, removes it from the address bar,
and uses the Agent/SQLite backend through the typed DataProvider boundary.

Build the production-like local workbench and let the Agent serve it directly:

```powershell
pnpm --filter @dealpilot/api-client build
pnpm --filter @dealpilot/cloud build:agent
pnpm --filter @dealpilot/agent start
```

The source-mode Agent defaults to `apps/cloud/dist`. A compiled Agent always
serves the sibling `web/` directory populated by the installer. `apps/web`
remains in the repository as the V1 behavior reference, but is no longer the
default Agent UI or an installer input.

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
