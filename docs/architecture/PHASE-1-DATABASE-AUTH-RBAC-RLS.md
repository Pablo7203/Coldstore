# Phase 1 — Database Foundation, Authentication, RBAC and RLS

## Environment boundary

The linked Supabase target is the dedicated GrandPa **development** project (`xjzdcpuwrjnpjzntytjs`, `eu-west-3`). Production will be a separate project. `.env.local` contains local credentials and is excluded by Git; no credential values are recorded here. Application schema is migration-owned.

## Schema and authorization

Migrations in `supabase/migrations/` create enums `staff_role` (`admin`, `manager`, `cashier`, `stock_assistant`) and `customer_status` (`active`, `inactive`); tables `staff_profiles`, `customers`, `permissions`, `role_permissions`, and `staff_profile_audit`; and authorization helpers `current_staff_role`, `has_permission`, `is_active_staff`, and `assign_staff_profile`.

RLS is enabled on all five tables. Customers can read only their linked profile; permitted staff can read customer records; staff can read their own profile, while admins can read staff profiles and audit entries. Authenticated users cannot directly insert staff profiles, change staff roles, or relink customers. `assign_staff_profile` requires active `manage_staff`, prevents customer promotion and self-escalation, and records audited changes.

The permission catalog is database-owned. Managers receive operational access without staff, audit, or settings administration; cashier and stock assistant permissions are narrower. Customer identities are not staff roles. Inactive staff have no effective staff role or permissions.

## Authentication and staff provisioning

Supabase Auth email/password serves staff and customers. Customer registration hardcodes customer account type and links the customer record through an Auth trigger. Staff have no public signup route. `/staff` and `/account` resolve server-side profiles and require active staff or linked customer context respectively. Session refresh is handled by the Next.js Proxy.

An operator can bootstrap the first admin using `pnpm bootstrap:admin -- <confirmed-auth-email> <full-name>` with the local Supabase secret key. Thereafter, active admins with `manage_staff` can create staff identities from `/staff`. The server action creates a confirmed Auth identity, invokes the permission-checking profile-assignment RPC with the current user session, and cleans up the identity if profile assignment fails. A new staff member sets a password through password recovery.

## Ghana phone handling

`normalize_ghana_phone` and staff/customer database triggers store phone numbers in canonical `+233XXXXXXXXX` form. The application validation shares the same accepted formats: Ghana local `0XXXXXXXXX`, `233XXXXXXXXX`, and `+233XXXXXXXXX`, with common spaces, hyphens, and parentheses removed. Invalid length, country code, or characters are rejected. The migration precheck found no existing customer or staff phone records to rewrite.

## Hosted verification

- The CLI is linked to the development project; Phase 1 schema and phone-normalization migrations are applied and listed as locally/remotely synchronized.
- Hosted schema inspection confirmed the five expected application tables, all five with RLS, expected role/status enums, helper functions, triggers, and policies. No Phase 2 tables exist.
- Thirty pgTAP assertions passed against the hosted database inside a rollback transaction. `supabase test db --linked` itself cannot resolve the pgTAP extension under the CLI runner role without additional schema privileges; a persistent extension-schema grant was rejected by automatic review. The assertions were executed through the privileged SQL query path instead, without widening runner privileges.
- Hosted phone SQL checks passed six accepted normalization forms and rejected six invalid forms; all run inside a rollback transaction.
- `scripts/verify-supabase-clients.mjs` verifies public Auth reachability with the publishable key and performs a minimal Auth Admin API request with the server-only secret key. The response data is discarded. The browser and server clients use generated `Database` types; the elevated client remains in a `server-only` module.
- Unit, type, lint, format, E2E, build, and diff checks are recorded in `docs/phase-1/REPORT.md` and `docs/evidence/phase-1/`.

## Scope boundary

Phase 1 includes foundational identity and access only. Products, inventory, POS, credit, ordering, payments, offline sales, synchronization, and reporting remain outside this phase.
