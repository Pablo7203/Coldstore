# Phase 1 Report — Database, Auth, RBAC and RLS

**Date:** 2026-10-11

**Status:** PASS WITH LIMITATIONS

**Target environment:** Grand Pa development only; production remains a separate future project.

## Delivered

- Added the project-local Supabase CLI at version 2.120.0 and `supabase/config.toml` with local project ID `grandpa-coldstore-dev`.
- Added committed migration `20261011230000_phase1_database_auth_rbac_rls.sql` for staff profiles, customer linkage, role permissions, permission helpers, profile audit history, customer signup linkage, and RLS policies.
- Added email/password sign-in, customer registration, email confirmation callback, password reset, protected staff/customer routes, and cookie session refresh through Next.js Proxy.
- Added a local-only initial administrator bootstrap script. Direct staff profile writes are blocked; the database role-assignment function requires the active `manage_staff` permission, prevents self-promotion, prevents customer-to-staff promotion, and audits role/activation changes.
- Added pgTAP coverage for role permissions, inactive staff, profile isolation, customer isolation, staff assignment, and audit behavior.

## Verification

- Phase 0 was rerun before the baseline commit: frozen install, lint, typecheck, format, unit tests, development E2E, production build, production E2E, and staged whitespace check passed.
- Initial baseline commit: `ab98344 chore: establish Phase 0 web application foundation`.
- Phase 1 checks: lint, typecheck, formatting, 7 unit tests, 5 development E2E tests, and production build passed. One production-only E2E case is skipped in development mode as intended.
- The app's `createBrowserClient` reached the development project's PostgREST API using only the local public URL/key. The read-only probe returned `PGRST205` / HTTP 404 because its deliberately nonexistent table is not in the schema yet; the Auth settings endpoint returned HTTP 200.
- Admin-client initialization and missing-key rejection passed unit tests using a test-only value. Generated browser JavaScript contained neither the service-role variable name nor the test value.
- All 30 pgTAP assertions passed against the existing Grand Pa **local** database inside a transaction. The transaction was rolled back, and follow-up inspection confirmed the Phase 1 tables were absent. No dashboard tables were created.
- `.env.local` is Git-ignored. It contains the development project URL and publishable key; its service-role entry is blank until configured locally. No credential values were written to this report or tracked files.

## Limitations and next local setup steps

- `supabase link --project-ref` did not complete. Supabase returned an access-control error stating that the CLI account lacks the required project privileges. No remote project reference was stored, and no migration was pushed to the hosted development project.
- The actual service-role key was not present, so privileged initialization was tested only with a test value; no privileged remote operation was attempted.
- After configuring the service-role key in the ignored `.env.local`, authenticate the CLI with an account that has access to the development project and link it:

  ```sh
  pnpm exec supabase login
  pnpm exec supabase link --project-ref <grand-pa-development-project-ref>
  pnpm exec supabase migration list
  pnpm exec supabase db push
  ```

  `db push` applies the already-committed migration file. Enter the database password only at the CLI prompt. Verify the linked target is the Grand Pa development project before pushing. Do not point this checkout at production.

## Git

- Phase 1 implementation and migration commits are on `main`.
- Working tree was clean when this report was prepared.
