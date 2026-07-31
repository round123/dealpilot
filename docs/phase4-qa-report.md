# Phase 4 Local QA Report

- Date: 2026-07-31
- Branch: `codex/atomic-personal-cloud`
- Baseline commit: `0b438b6`
- Scope: Atomic workbench + local Agent/SQLite + browser extension
- Result: local automated functional gates passed; desktop integration, real-site DOM, installer, and release checks remain

## Build And Test Evidence

| Check | Result |
|---|---|
| `pnpm type-check` | PASS, 6/6 workspace packages |
| `pnpm lint` | PASS, all 3 packages with lint scripts |
| `pnpm test` | PASS |
| Agent tests | PASS, 54/54 tests, 240 assertions |
| Cloud tests | PASS, 280 passed, 1 skipped across 56 files |
| Extension tests | PASS, 38/38 tests, 102 assertions |
| API client tests | PASS, 96/96 tests |
| Shared contract tests | PASS, 13/13 tests |
| `pnpm build` | PASS, 6/6 packages; Agent EXE, Atomic/PWA, Chrome MV3 and declarations built |
| Demo browser E2E | PASS, 4/4 desktop/mobile scenarios |
| Real Agent/SQLite E2E | PASS, 5/5 desktop/mobile scenarios with loopback-only network evidence |
| `git diff --check` | PASS; line-ending conversion notices only |

The Vite build still reports large-chunk warnings and `ra-core` cross-chunk circular dependency warnings. Both browser E2E suites passed against the resulting application, but bundle splitting remains follow-up work.

## Performance Evidence

| Scenario | Samples | Result | Threshold |
|---|---:|---:|---:|
| 1000-row CSV parse + commit | 20 independent databases | P95 581.78 ms | <= 30 s |
| Customer search | 30 | P95 0.87 ms | <= 1 s |
| Customer match | 30 | P95 0.66 ms | <= 1 s |
| Compiled Agent startup to HTTP health | 1 local run | 476.16 ms | <= 5 s |

The compiled-Agent QA also passed Atomic workbench serving, Chinese dashboard bundle detection, sibling migration discovery, SQLite creation, `DPBK` v2 backup creation, and Native Messaging 4-byte framing.

## EARS Acceptance Matrix

| AC | Status | Evidence / remaining observation |
|---|---|---|
| AC-01 | PASS | 20-run 1000-row import P95 581.78 ms; every run completed below 30 seconds. |
| AC-02 | PASS | Invalid rows are skipped with row-level reasons while valid rows continue. |
| AC-03 | PASS | Duplicate candidates, field conflicts, per-row/batch merge, skip and create-new are covered; commit revalidates candidates and stable identifiers. |
| AC-04 | PASS | 30-run customer-search P95 0.87 ms. |
| AC-05 | PASS | Soft delete cancels open reminders and removes matching; restore reinstates relationship and reminder state; exact 30-day cleanup and eight-domain cascade are covered. |
| AC-06 | PASS | Customer merge migrates follow-ups, projects, reminders and social bindings in one transaction. |
| AC-07 | MANUAL | Matching service P95 passes; real WhatsApp and Telegram one-to-one DOM identification still requires browser observation. |
| AC-08 | PASS | Shared-phone matches can return `multiple`; UI stops automatic selection and exposes candidates. |
| AC-09 | PASS | Search, bind, unbind and rebind are available through the Background RPC boundary. |
| AC-10 | MANUAL | Explicit unsupported state exists for groups/channels/unidentified conversations; real-site DOM cases remain. |
| AC-11 | MANUAL | Exact selected/interacted-message extraction is implemented; real WhatsApp/Telegram DOM verification remains. |
| AC-12 | PASS | Failed forms retain content; retry reuses the same idempotency key; concurrent duplicate submissions execute once. |
| AC-13 | MANUAL | Five-minute scheduler and notification adapter tests pass; visible Windows Notification Center delivery with browser closed remains. |
| AC-14 | MANUAL | Startup catch-up sweep and overdue persistence pass; visible startup notification remains. |
| AC-15 | PASS | Reminder state writes, notification de-duplication and per-item failure isolation pass. |
| AC-16 | PASS | Three-day escalation changes sorting only, not persisted status or priority. |
| AC-17 | PASS | Extension provides the explicit received-reply action; backend maps it to pending without message monitoring. |
| AC-18 | PASS | Popup ordering covers overdue, high risk, project/customer grade and due time. |
| AC-19 | PASS | Project stage changes emit one local event and never auto-advance. |
| AC-20 | PASS | Three-day milestone reminder generation is idempotent. |
| AC-21 | PASS | Seven-day risk escalation affects sorting without mutating severity/status. |
| AC-22 | PASS | Backup v2 uses Argon2id and AES-256-GCM with authenticated metadata. |
| AC-23 | PASS | Restore validates signature, compatibility, migrations, integrity and foreign keys before an atomic swap; bad inputs preserve the current database. |
| AC-24 | PASS | Agent E2E observed only loopback HTTP(S); Content Script production/source scans found no token, Authorization, storage or direct-fetch exposure. |
| AC-25 | MANUAL | Compiled EXE reached health in 476.16 ms and served Atomic; automatic browser launch and real tray actions remain desktop checks. |
| AC-26 | MANUAL | Native Messaging framing passes; Chrome/Edge automatic pairing and badge behavior remain real-browser checks. |
| AC-27 | PASS | Local workbench flows passed with external HTTP(S) blocked; WhatsApp/Telegram pages are the explicit exception. |
| AC-28 | PASS | Import, merge, reset, migration and restore failure tests verify atomicity and original-database preservation. |

## Additional PRD Evidence

- Fixed-time reminders support 3-day, 1-week and custom times. Paused follow-up requires a reason and accepts an optional reevaluation time.
- Paused reminders remain out of popup/dashboard before reevaluation; no-date paused reminders remain hidden; the exact due boundary is tested.
- Popup and Content surfaces support complete, snooze one day, ignore and received-reply actions with optimistic rollback and authoritative refresh.
- Import duplicate detection is case-insensitive for email, E.164 for phone and exact for platform accounts. Merge never overwrites an existing non-empty value.
- Migration recovery creates a verified pre-upgrade SQLite recovery point only when needed, restores it after failure, and retains only the newest successful point.
- Local data UI reports DB/WAL/SHM/recovery usage, backup age, data path, autostart support, backup/restore/export and irreversible clear semantics.
- Rolling 30-day on-time completion, match-accuracy proxy and reminder-handling metrics are computed locally. The exported JSON contains aggregates and methodology only.
- First Agent-mode use requires acknowledgement of extension permissions, local storage, backup, deletion and device-security boundaries; the same information remains available in settings.

## Remaining Manual Gates

1. Validate WhatsApp Web and Telegram Web one-to-one, group and channel flows, exact message marking and deep links across current DOM variants.
2. Confirm visible Windows notifications with browser closed and startup catch-up delivery.
3. Validate tray Open/Quit and tray recovery after `explorer.exe` restart.
4. Load the production extension in current Chrome and Edge, verify Native Messaging auto-pairing and badge updates.
5. Run the complete UI regression on current Chrome/Edge at 1366x768 and supported mobile widths.
6. Build and exercise NSIS install, upgrade and uninstall after `makensis` is available.
7. Complete pilot-user and legal/compliance checks required by the PRD.

Cloud Supabase/PostgreSQL, RLS, Auth, migration confirmation and cloud rollback are deliberately outside this local Phase 4 result. Their P3 hard gate remains open.
