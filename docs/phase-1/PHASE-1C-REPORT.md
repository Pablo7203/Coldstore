# Phase 1C.1 — Supabase API Key Migration & Live Verification

**Date:** 2026-10-12
**Status:** PASS WITH LIMITATIONS
**Target:** GrandPa development project (`xjzdcpuwrjnpjzntytjs`) only

## API key model and connectivity

- Migrated the application to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for browser-facing clients and `SUPABASE_SECRET_KEY` for the server-only Admin client.
- Renamed the local `.env.local` entries without printing their values. The file remains Git-ignored; `.env.example` contains empty placeholders.
- The configured URL matches the GrandPa development project. The publishable client initialized and its Auth settings request returned HTTP 200.
- A minimal `auth.admin.listUsers` request authenticated successfully. The response data was discarded; it did not provision or print any identity.
- Supabase CLI remains linked to the dedicated development project. Production remains separate.

## Live Admin and staff verification

- Initial Admin bootstrap succeeded using a fictional, confirmed Auth identity. The live test verified its Auth identity, active `admin` staff profile, bootstrap audit event, and absence of a public bootstrap endpoint.
- The authenticated Admin workflow created Manager, Cashier, and Stock Assistant profiles and corresponding Auth identities with the expected canonical phone values and roles. Creation audit entries were checked.
- Manager, Cashier, and Stock Assistant sign-ins and permission allow/deny assertions passed. A non-Admin role-assignment request was denied.
- Manager deactivation through the Admin UI passed. The Auth identity remained present, the profile was inactive, effective permissions were denied, an audit event was present, and the protected staff route redirected the inactive session.
- Valid Ghana phone forms stored canonical `+233XXXXXXXXX` values. The staff form rejected a clearly invalid number.
- The live test cleans up generated identities and linked customer/staff/audit records in `finally`; subsequent read-only cleanup verification found zero matching temporary users.

## Customer registration limitation

- The actual customer registration form was exercised, but hosted signup did not complete. A safe isolated fictional signup probe returned `over_email_send_rate_limit`; no user was created, and cleanup confirmed no probe identity remained.
- The project has email signup enabled and requires email confirmation. The observed `over_email_send_rate_limit` blocked the fictional signup attempt. Supabase documents a two-emails-per-hour limit for its built-in email provider; the development project's current email delivery configuration needs operator review before another signup run.
- No Auth confirmation or SMTP settings were changed. Customer signup, customer login/logout, and the two-customer live isolation journey therefore remain unverified in this run. The hosted 30-assertion RLS suite previously verified customer isolation in a rollback transaction.

## Database/RLS and regression

- The existing 30 hosted RBAC/RLS assertions passed again in a rollback transaction. Hosted Ghana SQL phone checks remain passing evidence from Phase 1B. This attempt made no database schema changes.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` (20 tests), `pnpm test:e2e` (8 passed, 2 skipped), `pnpm build`, and `git diff --check` passed. The opt-in hosted E2E stopped at customer signup due to the Auth email-send rate limit.
- Final security scans and regression output are summarized in `docs/evidence/phase-1/phase1c-live-results.txt`.
- The `supabase test db --linked` runner privilege limitation remains documented; no extra grants were added.

## Secret boundary

- Browser and server clients use the intended publishable/secret boundaries. The Admin module remains `server-only`.
- `.env.local` is ignored by Git. No API key values are stored in source, documentation, or evidence.
- Client bundles, service worker, HTML, IndexedDB, public environment, evidence, and Git working content were checked for secret exposure; results are in the phase evidence file.

## Phase status

**Status at Phase 1C.1: PASS WITH LIMITATIONS.** At that point, hosted database/RLS checks and live Admin/staff verification had passed, while customer signup remained blocked by the development email-send limit. The later Phase 1D attempt and current gate decision are recorded in `PHASE-1D-REPORT.md`, which supersedes this historical next-step note.

## Blocker and next action

Configure a suitable development email delivery method/rate allowance in the GrandPa development project, then rerun the hosted customer signup/login/isolation journey. Do not place SMTP credentials or API-key values in this repository. No Auth architecture workaround was made.

## Ready for Phase 2

The Phase 1D report records the project owner's later explicit deferral and authorization to proceed to Phase 2, with the Customer B UI/session limitation carried forward.
