# ADR-002: Supabase Publishable and Secret API Keys

Status: Accepted

Date: 2026-10-12

## Context

The initial architecture used the legacy `anon` and `service_role` key names and formats. Supabase now recommends publishable keys for public components and secret keys for trusted server components. This is a fresh application, so its environment names and clients can use the current model directly.

## Decision

- Browser-facing clients use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Server-only Admin operations use `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in a `server-only` module.
- `.env.local` remains ignored by Git; `.env.example` contains empty values only.
- All schema access from publishable clients remains subject to authenticated identity, table grants, and RLS policies. The secret key bypasses RLS and is used only after application server authorization checks.
- The development and production Supabase projects remain separate.

## Alternatives Considered

- Keep legacy `anon` and `service_role` variable names: rejected for this fresh application because Supabase recommends migrating to publishable and secret keys.
- Put the secret key in a public-prefixed environment variable: rejected because frameworks can bundle public variables into browser assets.
- Treat the publishable key as authorization: rejected; user identity and RLS remain the data authorization boundary.

## Consequences

Browser clients can safely identify the project with the publishable key, but they do not gain elevated access from it. Server Admin operations retain elevated access and must stay in server-only code. RLS tests remain necessary for all user-facing database paths; server code must perform explicit authorization before using the secret client.

Supabase documents the current key types, their privileges, and the recommendation to use publishable keys in code shipped to users and secret keys in controlled backend code: [API keys](https://supabase.com/docs/guides/getting-started/api-keys). The legacy key migration guide also describes the transition: [Migrating to publishable and secret API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

## Reversal / Migration Notes

If Supabase changes its key model, update the environment schema, both client boundaries, bootstrap and verification scripts, tests, and this ADR together. Rotate any exposed secret key immediately; never record a key value in this repository.
