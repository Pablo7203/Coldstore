# Phase 0 — Fresh Web Application Foundation

## Objective

Establish the Next.js, TypeScript, Tailwind CSS, shadcn/ui, Supabase client, environment, PWA, testing, quality, Git, CI, and documentation foundations. No business workflows or business database schema belong in this phase.

## Acceptance checklist

- [x] Single Next.js App Router repository and `main` branch
- [x] Strict TypeScript, Tailwind CSS, shadcn/ui foundation
- [x] Browser, server, and admin Supabase client boundaries
- [x] Optional runtime environment validation without Paystack credentials
- [x] Manifest and production-only, safe service-worker registration
- [x] Vitest, React Testing Library, and Playwright smoke test
- [x] Lint, typecheck, format check, test, E2E, and build scripts
- [x] CI and README
- [x] No business tables or business features

## Verification

Run `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `git diff --check`. Confirm the manifest and production service worker behavior, and inspect installed dependencies for excluded desktop/native technologies.

## Completion notes — 2026-10-11

The foundation has been implemented and verified. Supabase connectivity remains pending because no dedicated development project credentials were supplied. See [the implementation record](architecture/PHASE-0-FOUNDATION.md) for exact results and limitations.
