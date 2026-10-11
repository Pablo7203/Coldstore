# Grand Pa’s Cold Store

A single responsive web application foundation for Grand Pa’s Cold Store in Ghana. This repository is being built in phases; the current Phase 0 scope is infrastructure only and does not yet include business workflows.

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Supabase client boundaries, PWA foundation, Vitest, React Testing Library, and Playwright.

## Prerequisites

- Node.js 22.16 or newer
- pnpm 10.33.2 (the repository pins this package-manager version)

## Setup

```sh
pnpm install
Copy-Item .env.example .env.local
```

Fill in the dedicated Grand Pa development Supabase values when that project is provisioned. Paystack values are optional until the Paystack phase. Never place service-role or Paystack secret keys in client code.

## Development

```sh
pnpm dev
```

## Quality and tests

```sh
pnpm lint
pnpm typecheck
pnpm format
pnpm format:check
pnpm test
pnpm test:unit
pnpm test:e2e
```

Playwright requires its pinned Chromium browser to be installed once with `pnpm exec playwright install chromium`.

To verify the production-only service worker and cached public homepage after `pnpm build`, run the E2E suite with `PLAYWRIGHT_PRODUCTION=1` in the environment. For PowerShell:

```powershell
$env:PLAYWRIGHT_PRODUCTION = "1"
pnpm test:e2e
```

## Production build

```sh
pnpm build
pnpm start
```

Build and test commands do not require Supabase or Paystack credentials.

## Documentation

- Product requirements: [docs/PRD.md](docs/PRD.md)
- Technical architecture: [docs/TECHNICAL-ARCHITECTURE.md](docs/TECHNICAL-ARCHITECTURE.md)
- Phase 0 plan: [docs/PHASE-0-PLAN.md](docs/PHASE-0-PLAN.md)
- Implemented foundation record: [docs/architecture/PHASE-0-FOUNDATION.md](docs/architecture/PHASE-0-FOUNDATION.md)
- Architecture decisions: [docs/adr/](docs/adr/)
- Dissertation evidence: [docs/evidence/](docs/evidence/)
