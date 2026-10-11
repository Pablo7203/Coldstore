# Phase 1 — Database, Auth, RBAC and RLS

All application schema in this phase is defined in `supabase/migrations/` and must be committed before it is applied to the development project. Do not create application tables manually in the Supabase Dashboard.

## Development environment

- `supabase/config.toml` identifies the local CLI project as `grandpa-coldstore-dev`.
- The linked remote project is the dedicated **GrandPa development project**. Production uses a separate Supabase project when it is created.
- `.env.local` is ignored by Git. Keep the project URL, publishable key, and service-role key there; never paste credentials into docs, issues, or source files.
- Use the project-local CLI with `pnpm exec supabase`. The CLI is pinned in `package.json`.

## Initial administrator

Invite or create the owner's Auth identity in Supabase Auth. After the Phase 1 migration has been applied, create its staff profile from the local machine:

```sh
pnpm bootstrap:admin -- owner@example.com "Owner Name"
```

The script reads the service-role key from `.env.local`, refuses to promote a customer identity, and does not print credentials. Direct client inserts and updates to staff profiles are disabled. The database-only `assign_staff_profile` function checks the caller's active `manage_staff` permission and records role or activation changes in `staff_profile_audit`.

## Authentication behavior

- Staff sign in at `/login`; only active rows in `staff_profiles` enter `/staff`.
- Customers register at `/register`, confirm their email, then use `/account`.
- Password reset uses `/forgot-password` and `/reset-password`.
- Staff identities have no public registration route. The first admin is bootstrapped locally; staff management is reserved for a later phase.
- Next.js Proxy refreshes the cookie-backed Supabase session on protected paths. Server layouts revalidate claims and resolve profiles; PostgreSQL RLS remains the data-access boundary.

## Applying migrations

After `supabase link` has authenticated and stored the development project reference, review the pending list with `pnpm exec supabase migration list`. Commit migrations before applying them with `pnpm exec supabase db push`. Never run linked commands while the CLI points at a production project.
