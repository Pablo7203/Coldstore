# Phase 1C — Live Identity & Staff Administration Verification

**Date:** 2026-10-12
**Status:** FAIL — blocked before identity provisioning
**Target:** GrandPa development Supabase project only

## PHASE

Phase 1C — Live Identity & Staff Administration Verification

## STATUS

FAIL. The hosted workflow could not begin because the first Auth Admin API request using the locally configured service-role value returned `Invalid API key`. The test stopped before bootstrap or account creation.

## INITIAL ADMIN

Not run. The test would first create a fictional, confirmed Auth identity in memory and invoke the repository’s `pnpm bootstrap:admin` workflow. The Auth Admin API rejected the initial identity provisioning request, so bootstrap was not invoked.

## ADMIN LOGIN

Not run; no controlled Admin identity was provisioned.

## STAFF CREATION

Not run; no Admin session was available. An Admin-only staff directory, creation form, and deactivation control are implemented using server-side permission checks and the existing `assign_staff_profile` RPC.

## MANAGER LOGIN

Not run; no controlled Manager identity was provisioned.

## CASHIER LOGIN

Not run; no controlled Cashier identity was provisioned.

## STOCK ASSISTANT LOGIN

Not run; no controlled Stock Assistant identity was provisioned.

## CUSTOMER REGISTRATION

Not run; the hosted workflow stopped before the browser journey.

## CUSTOMER LOGIN

Not run; no controlled Customer identities were provisioned.

## CUSTOMER ISOLATION

Phase 1B’s hosted SQL/pgTAP authorization suite previously passed 30 assertions inside a rollback transaction. The Phase 1C two-customer browser/API journey was not run.

## STAFF DEACTIVATION

Not run; no staff accounts were provisioned. The new Admin control delegates to `assign_staff_profile`, preserving the database permission and audit checks.

## GHANA PHONE LIVE VERIFICATION

Phase 1B hosted SQL checks passed six accepted normalization cases and rejected six invalid cases. Phase 1C form journeys were not run.

## SERVICE-ROLE OPERATION

FAIL. Client construction succeeds, but the first live Auth Admin API operation returned `Invalid API key`. The value remains local in ignored `.env.local`; its contents were neither read into output nor recorded. The local development service-role configuration needs correction for the linked GrandPa project.

## SECURITY TESTS

- The opted-in test generates fictional passwords in process memory, runs the bootstrap CLI, exercises the browser and hosted permissions, and removes test records in `finally`.
- The attempt failed before creating any account. A linked SQL count check confirmed zero matching Phase 1C Auth identities, customer profiles, and staff profiles.
- No service-role value was included in output or evidence. The 30 hosted RBAC/RLS SQL assertions were rerun after the Admin deactivation changes and passed in a rollback transaction. No grants were added for the pgTAP CLI runner.

## REGRESSION

PASS: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` (20 tests), `pnpm test:e2e` (8 passed, 2 skipped: production-only and opt-in hosted identity flow), `pnpm build`, and `git diff --check`. The opt-in hosted test itself failed before provisioning because the Auth Admin API rejected the local service-role value. Results are in `docs/evidence/phase-1/final-checks.txt`.

## EVIDENCE

- `docs/evidence/phase-1/phase1c-live-results.txt`
- Phase 1B hosted schema/RLS/phone evidence remains in `docs/evidence/phase-1/`.
- Local credentials are excluded from Git and absent from evidence.

## REMAINING LIMITATIONS

First Admin bootstrap, all successful hosted login journeys, Admin staff creation/deactivation, customer registration/login/isolation, and real service-role staff provisioning are not demonstrated in Phase 1C.

## BLOCKERS

Replace the invalid server-side service-role configuration locally in ignored `.env.local` with the valid key for the linked GrandPa development project. Do not paste it into chat or documentation. Rerun only the opted-in hosted test with `PHASE1C_LIVE=1 pnpm exec playwright test tests/e2e/phase1c-live.spec.ts`.

## PHASE 1 FINAL STATUS

PASS WITH LIMITATIONS — Phase 1 schema, hosted RLS/authorization SQL assertions, and Ghana phone database checks passed; hosted live identity workflows remain outstanding.

## READY FOR PHASE 2

NO — complete and verify the Phase 1C live identity workflows first.
