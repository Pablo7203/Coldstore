# Phase 4 — Customer Credit Report

**Status: FAIL — implementation and local unit work are present, but hosted acceptance is not complete.**<br>
**Ready for Phase 5: NO.**

## Implemented locally

- Added migrations for the `outstanding` payment status, credit account/ledger schema, credit RPCs, and the credit-aware POS transaction.
- Added credit limit/status management, available-credit calculation, immutable ledger protection, repayment validation/idempotency, account/history screens, printable repayment receipts, and POS/receipt credit presentation.
- Added exact-decimal unit coverage and hosted pgTAP assertions.
- Added ADR-004 explaining that a credit tender records customer debt and not settled funds.
- Documented locking order as customer → account → products ordered by UUID → inventory balances ordered by UUID.

## Local verification

- Credit unit test: **PASS**, 4 tests.
- Prettier check on Phase 4 TypeScript and documentation: **PASS**.
- Phase 4-specific TypeScript diagnostic filter: **no Phase 4 errors reported**.
- Full unit suite: **BLOCKED** by sandbox temporary-directory mapping (`ENOENT` under the ephemeral `sandbox...Temp` directory); one focused credit suite passed.
- Repository-wide typecheck: **FAIL** in the current checkout. The branch contains an incomplete Phase 3 base, duplicate nested Phase 3 source folders, and installed Supabase/Playwright/testing-library types that do not match existing source usage. This includes missing Phase 3 RPC declarations and Supabase Auth APIs; it is not evidence of Phase 4 hosted correctness.
- `git diff --check`: no whitespace errors reported (Git emitted only line-ending warnings).
- Full lint, E2E, and build have not been established as passing.

## Hosted verification blockers

- `.env.local` links to project reference `xjzdcpuwrjnpjzntytjs` (GrandPa development), but this Git checkout’s migration directory initially stopped at Phase 2. Phase 3 SQL/source was present in a separate local copy and has been restored in part; do not push Phase 4 until the canonical branch migration/source baseline is reconciled and the remote/local migration histories are confirmed equal.
- `supabase migration list --linked` could not run: the CLI was denied writing its telemetry temporary file under `C:\Users\Thoma\.supabase`. No hosted migration was applied, no database tables were created manually, and no live test was run.
- Consequently, hosted schema/RLS, credit account creation, sale/repayment browser flows, live balance reconciliation, simultaneous credit-sale/repayment tests, twice-consecutive hosted runs, Phase 3 regression, and Phase 2 inventory regression remain **unverified**.

## Deferred items preserved

- Phase 1 Customer B live UI/session verification.
- Phase 2 product image upload.
- Phase 3 customer authenticated browser route verification.
- Phase 3 void/reversal flows.
- Phase 3 offline receipt allocation verification.

No Phase 5 or later product workflow was implemented. No credentials, tokens, or passwords are recorded here.
