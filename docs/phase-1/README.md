# Phase 1 — Database, Auth, RBAC and RLS

All application schema is defined by committed migrations in `supabase/migrations/`. Do not create Grand Pa application tables manually in the Supabase Dashboard.

## Development environment

- Dedicated development project: GrandPa, Supabase ref `xjzdcpuwrjnpjzntytjs` (region `eu-west-3`). Production will use a separate project later.
- Supabase CLI is linked to this development project. Confirm the target before any linked database operation with `pnpm exec supabase projects list` and `pnpm exec supabase migration list`.
- `.env.local` is Git-ignored. Store `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY` locally. Never put secret values in source, docs, terminal captures, or evidence.
- `pnpm exec node scripts/verify-supabase-clients.mjs` checks the linked development endpoint, public Auth reachability, and a minimal server Admin API request. It prints statuses only and discards response data.

## Initial administrator

Use the local operator bootstrap only for the confirmed owner Auth identity:

```sh
pnpm bootstrap:admin -- owner@example.com "Owner Name"
```

The script reads the secret key locally, refuses customer or already-profiled identities, and does not print credentials. Staff accounts can then be created from `/staff` by an active admin with `manage_staff`; the server action creates a confirmed Auth identity, assigns its profile through the permission-checked database function, and removes the new identity if profile assignment fails. Staff set their password through password recovery.

## Authentication behavior

- Staff sign in at `/login`; only active `staff_profiles` identities can use `/staff`.
- Customers register at `/register`, confirm their email, then use `/account`.
- Password reset uses `/forgot-password` and `/reset-password`.
- Staff registration is not public. Database role changes and profile assignment remain protected by `assign_staff_profile` and audit events.
- Ghana phones are normalized to `+233` plus nine digits in both application validation and database triggers. Local `0XXXXXXXXX`, `233XXXXXXXXX`, and `+233XXXXXXXXX` forms are accepted; malformed or non-Ghana values are rejected.

## Migrations and checks

Apply only committed migrations to the linked development project with `pnpm exec supabase db push`. Generated database types in `types/database.ts` come from the linked hosted schema. Hosted evidence and the Phase 1 report are in `docs/evidence/phase-1/` and `docs/phase-1/REPORT.md`.
