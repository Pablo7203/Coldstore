# Phase 1 Report — Database, Auth, RBAC and RLS

**Date:** 2026-10-12
**Status:** PASS WITH LIMITATIONS — Phase 1D; remaining live Customer B UI/session checks explicitly deferred by project owner.
**Scope:** Phase 1 gate decision. Phase 2 is unblocked by explicit owner authorization; see `PHASE-1D-REPORT.md` for the unresolved live verification.

## Phase and Git baseline

- Phase 0 baseline: `ab98344 chore: establish Phase 0 web application foundation`.
- Phase 1 and verification commits precede the current Phase 1B completion commit; see `git log` for the sequence.
- No GitHub remote is configured.

## Development Supabase connection

- Target verified by the CLI: GrandPa development project, ref `xjzdcpuwrjnpjzntytjs`, region `eu-west-3`, healthy and linked. Production is a separate future project.
- `.env.local` is Git-ignored and uses `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`; values are not recorded here.
- The browser publishable client initialized and the public Auth settings endpoint returned HTTP 200.
- The server-only secret client initialized and a minimal Auth Admin API request succeeded; response data was discarded.
- Supabase CLI reports all local/remote migrations synchronized. No application schema was created manually in the Dashboard.

## Hosted database verification

- Applied migrations: `20261011230000_phase1_database_auth_rbac_rls.sql`, `20261012010000_enable_pgtap_for_phase1_tests.sql`, and `20261012030000_normalize_ghana_phone_numbers.sql`.
- Hosted schema query confirmed the expected five application tables, role/status enums, helper functions, triggers, eight RLS policies, RLS enabled on all five tables, and no Phase 2 tables.
- Thirty RLS/RBAC pgTAP assertions passed on the hosted project in a rollback transaction, covering customer isolation, staff boundaries, role assignment/denial, audit events, customer-promotion rejection, and inactive staff.
- Six Ghana phone inputs normalized to canonical `+233XXXXXXXXX`; six invalid inputs were rejected. Checks ran in a rollback transaction. The pre-migration check found no existing profiles or phone rows to rewrite.
- Evidence: `docs/evidence/phase-1/hosted-schema-verification-output.txt`, `hosted-pgtap-admin-query.txt`, `hosted-phone-precheck.txt`, and `hosted-phone-verification.txt`.

### pgTAP runner limitation

`pnpm exec supabase test db --linked` fails before assertions because the CLI test role cannot access the installed `extensions` schema. Automatic review rejected a persistent schema-usage grant to that runner role as a privilege-boundary change. The grant migration was reverted; no lasting grant was applied. The same 30 assertions passed through the privileged hosted SQL query path without widening test-runner privileges. Raw CLI failure and diagnostics are in `docs/evidence/phase-1/hosted-pgtap.txt` and the related diagnostic files.

## Implemented and verified

- Phase 1 database identity, roles, permissions, audit, and RLS are migration-defined.
- Staff/customer auth context, customer-only public registration, staff login, logout, recovery, and protected routes remain in place.
- Ghana phone validation/normalization is implemented in the application and database. Customer registration passes the canonical number; database triggers enforce canonical storage for direct writes too.
- Generated hosted database types are committed at `types/database.ts` and used by browser, server, and admin clients.
- `/staff` now exposes an admin-only staff creation form. Its server action checks the active `manage_staff` permission, creates a confirmed Auth identity with the server-only client, assigns the profile using the caller's authenticated RPC (which rechecks authorization and audits the change), and removes the identity if assignment fails. New staff use password recovery to set a password.

## Auth and staff lifecycle coverage

- Playwright verified failed hosted Auth login, anonymous redirects, customer-only registration fields, recovery screens, public home links, manifest, and service worker.
- Phase 1C.1 live verification passed initial Admin bootstrap, Admin and staff sign-ins, staff creation and deactivation, unauthorized privileged-operation denial, and live Ghana phone validation/normalization. Generated identities were removed by test cleanup.
- Phase 1D later passed Customer A's full live UI session path and Customer B's authenticated profile linkage/RLS checks, but its Customer B UI login did not reach `/account`. The confirmation-link flow was also reported to show errors. Those remaining checks are explicitly deferred by the project owner, not counted as passing; see `docs/phase-1/PHASE-1D-REPORT.md` and sanitized evidence.

## Regression results

- `pnpm.cmd typecheck`: PASS.
- `pnpm.cmd lint`: PASS.
- `pnpm.cmd format:check`: PASS after formatting the generated types and staff files.
- `pnpm.cmd test`: PASS, 5 test files and 20 tests.
- `pnpm.cmd test:e2e`: PASS, 8 passed and 1 production-only test skipped in development mode.
- `pnpm.cmd build`: PASS (production compilation, type validation, and route generation).
- `git diff --check`: PASS after final documentation and evidence updates.
- Hosted client probe: PASS (public Auth HTTP 200; public/admin clients initialized; no credentials or account data printed).

## Security boundaries

- `.env.local` was confirmed ignored by Git and is not staged.
- Browser client uses only the public Supabase URL and publishable key. Admin client is marked `server-only`; the secret key remains server-side.
- No secret values or user account data are included in documentation/evidence.
- Phase 1C.1 live results, key boundary scans, and current regression results are recorded in `docs/phase-1/PHASE-1C-REPORT.md` and `docs/evidence/phase-1/phase1c-live-results.txt`.

## Files and artifacts

- Migrations: `supabase/migrations/`.
- RLS tests: `supabase/tests/phase1_rbac_rls.test.sql`.
- Types: `types/database.ts`.
- Evidence: `docs/evidence/phase-1/`.
- Setup/runbook: `docs/phase-1/README.md`.
- Architecture: `docs/architecture/PHASE-1-DATABASE-AUTH-RBAC-RLS.md`.

## Phase boundary

Phase 1 is accepted with limitations. On 2026-10-12 the project owner explicitly deferred the remaining Customer B live UI/session checks and authorized proceeding. **Ready for Phase 2: YES**, with the Phase 1D verification limitation carried forward and to be resolved before calling customer authentication fully verified.
