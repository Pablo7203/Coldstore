# Phase 1B Report — Hosted Supabase Verification

**Date:** 2026-10-12
**Status:** PASS WITH LIMITATIONS
**Scope:** Phase 1 completion only. Phase 2 has not started.

## Phase and Git baseline

- Phase 0 baseline: `ab98344 chore: establish Phase 0 web application foundation`.
- Phase 1 and verification commits precede the current Phase 1B completion commit; see `git log` for the sequence.
- No GitHub remote is configured.

## Development Supabase connection

- Target verified by the CLI: GrandPa development project, ref `xjzdcpuwrjnpjzntytjs`, region `eu-west-3`, healthy and linked. Production is a separate future project.
- `.env.local` is Git-ignored. A verification script reads local variables without printing their values.
- Public browser client initialized and the public Auth settings endpoint returned HTTP 200.
- Server admin client initialized with the locally configured service-role value; verification did not perform a privileged data request.
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
- Live successful customer signup/login/logout, initial admin bootstrap, live deactivated-user route denial, and end-to-end admin-created staff sign-in were not executed. There are no controlled test identities/passwords in this workspace, and the verification did not create user accounts or request/print account data. The staff creation path is covered through its server/database authorization design, but its complete hosted UI lifecycle remains an acceptance limitation.

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
- Browser client uses only public Supabase URL/key. Admin client is marked `server-only`; no service-role value is referenced by client UI code.
- No secret values or user account data are included in documentation/evidence.
- Staff/service-role real-world operations were deliberately not attempted as a side effect of verification.

## Files and artifacts

- Migrations: `supabase/migrations/`.
- RLS tests: `supabase/tests/phase1_rbac_rls.test.sql`.
- Types: `types/database.ts`.
- Evidence: `docs/evidence/phase-1/`.
- Setup/runbook: `docs/phase-1/README.md`.
- Architecture: `docs/architecture/PHASE-1-DATABASE-AUTH-RBAC-RLS.md`.

## Phase boundary

Phase 1B work is complete with the live-auth lifecycle limitations above. **Do not start Phase 2** until the remaining controlled identity journeys are demonstrated or explicitly deferred by the project owner.
