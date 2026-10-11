# Phase 0 Foundation Record

This file records what was implemented for Phase 0. No business functionality or business tables are part of this phase.

## Implemented

- Next.js 16.4.0 App Router, React 19.3.0, strict TypeScript, Tailwind CSS 4.3.3, and a shadcn/ui configuration with a Card primitive.
- Single repository on the `main` branch, with pnpm 10.33.2 pinned and an exact-version lockfile.
- Browser-safe, cookie-based server, and server-only privileged Supabase client boundaries. No project is connected yet.
- Zod environment parsing separates public browser variables from optional server secrets; empty Paystack values do not block a build.
- Typed App Router web manifest with an SVG app icon; production-only service-worker registration; conservative public homepage/offline fallback caching; API and authorization- or cookie-bearing requests bypass caching; service-worker cache versioning and no-store update headers.
- Vitest + React Testing Library unit/component smoke coverage and a Playwright Chromium smoke suite, including manifest and production service-worker/offline checks.
- ESLint flat config, Prettier, EditorConfig, gitignore, GitHub Actions CI, README, Phase 0 plan, ADR, and documentation directories.
- Empty Supabase migrations, tests, and seed scaffold; no business tables or seed data.

## Verification evidence

- `pnpm install`: PASS; lockfile created with pnpm 10.33.2.
- `pnpm install --frozen-lockfile`: PASS.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm format:check`: PASS.
- `pnpm test`: PASS, 2 test files / 2 tests.
- `pnpm test:e2e` in development mode: PASS, 3 tests; production-only offline-cache test correctly skipped.
- `pnpm build`: PASS; Next.js production build completed without service credentials.
- `PLAYWRIGHT_PRODUCTION=1 pnpm test:e2e`: PASS, 4 tests including service-worker registration and offline cached homepage.
- Manifest route and service-worker response headers verified in browser tests.
- Supabase remote connectivity: NOT TESTED; dedicated development credentials are pending.
- Dependency inspection: no Tauri, Electron, SQLite, WordPress, or WooCommerce dependencies. `electron-to-chromium` is a transitive browser-compatibility data package, not Electron.
- No `.env.local` or real secrets were created. The repository has no commits or remote configured.
- `git diff --check`: PASS for the tracked working tree. Because this fresh repository has no commit and all project files are still untracked, the tracked diff is empty. A no-index whitespace scan found only the intentional Markdown hard-break spaces in the supplied PRD and technical architecture documents; those source references were preserved unchanged.
- GitHub Actions CI: configuration reviewed locally; no remote workflow run exists because no GitHub remote was configured.

## Known limitations

- CI currently runs install, lint, typecheck, unit/component tests, and build. Browser E2E is available locally but not part of ordinary CI.
- The SVG manifest icon uses a scalable `sizes: "any"` asset; browser manifest and service-worker behavior were verified, but install prompts vary by browser/platform and HTTPS deployment remains future work.
- Supabase connectivity and future-phase service behavior are not claimed as complete.
