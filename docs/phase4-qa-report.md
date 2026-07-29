# Phase 4 QA Report

- Date: 2026-07-29
- Branch: `codex/pragmatic-three-layer`
- Public repository: <https://github.com/round123/dealpilot>
- Result: 20 automated passes, 7 manual gold-standard checks pending, 1 conditional design check

## Build And Test Evidence

| Check | Result |
|---|---|
| `pnpm type-check` | PASS, 4/4 packages |
| `pnpm test` | PASS, 14 tests / 41 assertions |
| `pnpm lint` | PASS, web and extension |
| `pnpm build` | PASS, Agent EXE + Web + Chrome MV3 + shared declarations |
| Architecture boundary tests | PASS, routes -> services -> repositories -> db/platform |
| Compiled Agent startup | PASS, 217.44 ms to HTTP health |
| Compiled Agent backup | PASS, HTTP 200, `DPBK` v2 |
| Native Messaging protocol | PASS, framed `hello` returned `auth` |

## Performance Evidence

| Scenario | Samples | Result | Threshold |
|---|---:|---:|---:|
| 1000-row CSV parse + commit | 20 independent databases | P95 652.25 ms | <= 30 s |
| Customer search | 30 | P95 1.63 ms | <= 1 s |
| Social account match | 30 | P95 0.43 ms | <= 1 s |

The checked-in Excel fixture produced 6 rows: 4 imported, 2 rejected with row-level errors.

## EARS Acceptance Matrix

| AC | Status | Evidence / remaining observation |
|---|---|---|
| AC-01 | PASS | 20-run 1000-row import P95 652.25 ms; all runs imported 1000 rows. |
| AC-02 | PASS | `test_customers.xlsx`: 4 valid rows committed and 2 invalid rows skipped with reasons. |
| AC-03 | PASS | Duplicate candidate returned; unresolved commit rejected with 400; explicit skip committed. |
| AC-04 | PASS | 30-run customer-search P95 1.63 ms. |
| AC-05 | PASS | Soft delete cancels open reminders and excludes matching without deleting bindings; restore reinstates reminder status, resolution, and binding. |
| AC-06 | PASS | Merge integration retained and migrated follow-up, project, reminder, and social binding. |
| AC-07 | MANUAL | Match API P95 0.43 ms passes. Real WhatsApp and Telegram one-to-one DOM identification remains to be observed in Chrome. |
| AC-08 | CONDITIONAL | Service and UI stop on `multiple`; the production unique `(platform, normalized_identifier)` index prevents an exact duplicate binding through normal writes. Requires product acceptance of this stronger invariant or a broader matching rule. |
| AC-09 | PASS | Manual bind API returned 201 and subsequent resolve returned the bound customer. |
| AC-10 | MANUAL | Explicit unsupported state exists for group/channel/unidentified conversations; real site DOM observation remains. |
| AC-11 | MANUAL | Adapter now uses selected text, selected state, or the last user-interacted message and never falls back to the newest message. Real WhatsApp/Telegram DOM observation remains. |
| AC-12 | PASS | Failed form state is retained; a retry reuses the same payload and idempotency key. Duplicate backend submission produced the same ID and one row. |
| AC-13 | MANUAL | Five-minute delivery sweep and real `node-notifier` callback pass. Human confirmation that the toast is visible in Windows Notification Center remains. |
| AC-14 | MANUAL | Startup immediately runs the due-reminder sweep and persists overdue state. Human confirmation of the startup toast remains. |
| AC-15 | PASS | State writes are atomic; a pre-notified reminder is not notified again when it becomes overdue; notification failures stay retryable. |
| AC-16 | PASS | Three-day overdue escalation affects sort weight only; persisted status/priority are unchanged. |
| AC-17 | PASS | `replied` is an explicit user action mapped back to `pending`; no incoming-message listener changes reminder state. |
| AC-18 | PASS | Popup ordering test covers overdue escalation, priority, project/customer grade, due time, and stable ID tie-break. |
| AC-19 | PASS | Stage update created one `project.stage_changed` local event and did not auto-advance. |
| AC-20 | PASS | Three-day milestone sweep created exactly one reminder and is idempotent by milestone marker. |
| AC-21 | PASS | Seven-day open risk gains one sort tier without mutating severity or status. |
| AC-22 | PASS | Backup v2 uses salted Argon2id (19 MiB, 2 iterations, p=1) and AES-256-GCM; metadata is authenticated as GCM AAD. |
| AC-23 | PASS | Correct password validates and atomically swaps to the restored database; wrong password and modified ciphertext fail without changing current row count. |
| AC-24 | PASS | Runtime endpoint audit found only localhost API traffic plus user-initiated WhatsApp/Telegram tab URLs; extension storage contains token and port, not business records. |
| AC-25 | MANUAL | Compiled EXE reached health in 217.44 ms and served the workbench. Automatic browser opening plus actual tray open/quit clicks remain desktop observations. |
| AC-26 | MANUAL | Compiled host passed the real 4-byte Native Messaging framing protocol. Loading `.output/chrome-mv3` in Chrome and observing automatic pairing remains. |
| AC-27 | PASS | Web UI and business API are local, production assets are served by Agent, and no product-server runtime dependency exists. |
| AC-28 | PASS | Import and delete/restore integration tests cover transactionality; failed backup restore preserved the current database and concurrent writes receive 409 during restore. |

## Spec Section 12

| Step | Status | Evidence |
|---|---|---|
| 1. Start Agent | PARTIAL | EXE health and UI load pass; token is stored before React mounts and removed from URL. Automatic browser/tray click observation is pending. |
| 2. Import customers | PASS | Real `.xlsx` parse and commit integration test. |
| 3. Create reminder | PASS | Reminder API/service validation and persistence covered by Phase 4 tests. |
| 4. Reminder delivery | PARTIAL | Scheduler, system adapter callback, and extension badge refresh implementation pass; visible Windows toast and Chrome badge remain manual. |
| 5. Security | PASS | Missing token returns 401; evil Origin returns 403. |
| 6. Backup and restore | PASS | Argon2id/AES-GCM compiled-EXE creation, validation, corruption, wrong-password, and restore checks pass. |
| 7. Build verification | PASS | lint, type-check, test, and build all pass. |

## Manual Gold-Standard Checklist

1. Start Chrome, load `apps/extension/.output/chrome-mv3`, and confirm extension ID `mblecgcjdmeialnhjbbbbgilklkbpdhn`.
2. Start Agent normally and confirm Native Messaging pairing plus pending/overdue badge count.
3. On WhatsApp and Telegram, verify one-to-one, group/channel unsupported state, manual bind, and marking the exact interacted message.
4. Create a reminder due within five minutes, close browser tabs, and visually confirm the Windows toast; restart Agent with an overdue reminder and confirm catch-up delivery.
5. Click tray Open and Quit, then restart `explorer.exe` and confirm the icon returns.

The UI was also checked at 1366 x 768 across dashboard, customers, projects, reminders, and backup routes. After the token bootstrap fix, all first-screen API calls returned 200 with no console errors.
