# Phase 3 Hosted Verification Evidence

Target: GrandPa development Supabase project, reference `xjzdcpuwrjnpjzntytjs`.

## Database

- Local/hosted migration list matched through `20261012074000`.
- `supabase/tests/phase3_customers_pos_sales.test.sql`: 48/48 pgTAP assertions passed.
- `supabase/tests/phase2_products_inventory.test.sql`: 67 assertions passed (`finish = 1..67`).
- The test assertions cover product lookup by name/SKU/barcode; customer creation without Auth and phone normalization; cash and externally confirmed MoMo; database-authoritative prices; exact decimal line totals; atomic insufficient-stock rollback; idempotent retries; completed-sale immutability; customer, cashier, manager, Stock Assistant, and anonymous RLS; audit; movement linkage; and balance/ledger reconciliation.

## Hosted browser runs

Two serialized runs passed consecutively:

- `phase3-e2e-mv5bvyss-e3bb4dfa`
- `phase3-e2e-mv5bwzed-a1a6a39c`

Each trace records the walk-in customer flow, canonical phone, duplicate warning, manager customer search/edit/activation, cash receipt, external MoMo receipt, history, stock reconciliation, concurrent stock contention, Stock Assistant denial, customer RLS sale denial, and anonymous POS redirect. Matching POS and receipt screenshots are preserved beside each sanitized JSON trace. Both runs recorded cash GHS 18.51, MoMo GHS 6.17, stock eight after the sales, and one unit remaining after the concurrency race with movement ledger total one. Test passwords, access tokens, service-role keys, and email/SMTP credentials are not included.

## Regression

- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `pnpm format:check`: pass
- `pnpm test`: 9 files, 33 tests passed
- `pnpm test:e2e`: 8 passed, 5 opt-in hosted suites skipped
- Phase 3 hosted E2E with `PHASE3_LIVE=1 --workers=1 --repeat-each=2`: 2 passed
- `pnpm build`: pass
- `git diff --check`: pass (Git emitted line-ending conversion warnings only)

The live Phase 3 E2E intentionally does not claim browser login or authenticated staff-route denial for the test customer. The test customer's hosted sales read and sale-creation RPC were denied. Customer browser-auth verification remains part of the separately deferred Phase 1 limitation.
