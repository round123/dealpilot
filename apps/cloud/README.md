# DealPilot Cloud

DealPilot Cloud is derived from Atomic CRM and is the V2 Web/PWA application.
See `UPSTREAM.md` and `LICENSE.md` for the pinned upstream revision and license.

## Cloud development

The product has one runtime mode: Web/PWA connected to the hosted Supabase
development project. The developer machine only runs Vite; it does not run a
local PostgreSQL database, Supabase stack, Agent API, tray process, or SQLite
business backend.

Ensure `apps/cloud/.env.development` contains the hosted project URL and public
publishable key, then start the Web app:

```powershell
pnpm --filter @dealpilot/cloud dev
```

Open the URL printed by Vite, sign in with a test account from the Supabase
development project, and validate changes against real Auth, PostgreSQL, RLS,
Storage, RPC, and Edge Function behavior. Never use production customer data
in the development project.

Demo configuration remains only for isolated UI regression tests; it is not a
product startup mode. V1 SQLite input is handled only by the standalone
`packages/migration` package.

## Validation

```powershell
pnpm --filter @dealpilot/cloud type-check
pnpm --filter @dealpilot/cloud lint
pnpm --filter @dealpilot/cloud test
pnpm --filter @dealpilot/cloud build
```
