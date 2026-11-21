# Phase 2 — Products & Inventory Report

**Phase status:** PASS WITH LIMITATIONS<br>
**Phase 3 readiness:** NO — one stable hosted live Playwright pass remains outstanding.<br>
**Environment:** GrandPa development Supabase project only (`xjzdcpuwrjnpjzntytjs`).

## Delivered

- Migration-backed product categories, product catalogue, exact GHS prices, current stock balances, append-only movements, and audit records.
- Role-based permissions and RLS for catalogue, inventory, movements, and audit data.
- Atomic stock mutation RPC with per-product locking, non-negative stock enforcement, idempotency, and balance-to-ledger consistency.
- Staff pages for catalogue, product edit, inventory operations, and movement history.
- Validation, unit, database, hosted concurrency, and opt-in hosted browser coverage.
- Development-only fictional seed data. No application schema was created manually in Supabase Studio.

## Acceptance results

| Area                           | Result                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosted migrations              | PASS — all five local/remote migration versions match                                                                                                                                                                                                                                            |
| Hosted schema and RLS          | PASS — five Phase 2 tables have RLS; no Phase 3 tables or direct balance/movement write grants                                                                                                                                                                                                   |
| Hosted pgTAP                   | PASS — plan `1..67` returned with no failed assertion output                                                                                                                                                                                                                                     |
| Hosted concurrent stock writes | PASS — concurrent receipts matched the expected 100.375 balance and ledger total                                                                                                                                                                                                                 |
| Catalogue and stock UI         | PASS with limitation — one hosted run completed the UI and role/RLS assertions, but failed at cleanup due to the actor FK/immutability conflict; the migration fix is applied                                                                                                                    |
| Clean hosted live E2E rerun    | INCONCLUSIVE — a diagnostic run passed identity setup, manager UI login, category/product creation, and reached product edit; edit POST returned 200 but its client action state stayed pending. A later retry could not start because the local Next compiler was denied workspace path access. |
| Lint                           | PASS                                                                                                                                                                                                                                                                                             |
| Typecheck                      | PASS                                                                                                                                                                                                                                                                                             |
| Format check                   | PASS                                                                                                                                                                                                                                                                                             |
| Unit tests                     | PASS — 7 files, 26 tests                                                                                                                                                                                                                                                                         |
| Standard Playwright suite      | PASS — 8 passed, 4 skipped; the hosted Phase 2 scenario is opt-in                                                                                                                                                                                                                                |
| Production build               | PASS                                                                                                                                                                                                                                                                                             |
| `git diff --check`             | PASS                                                                                                                                                                                                                                                                                             |

## Security and data handling

`.env.local` is Git-ignored and untracked. The browser client uses only the public Supabase URL/key; the service-role key remains server-only. No secrets, passwords, confirmation tokens, or session tokens are in the report or evidence. A sanitized hosted query confirmed zero temporary test Auth accounts and zero active test catalogue rows. Deactivated stock fixtures remain to preserve their append-only movement history.

## Deferred items and phase gate

- A stable live hosted Playwright pass is required before Phase 3 readiness is upgraded. The product edit pending-state root cause remains undetermined; no speculative code fix was applied. The latest retry was blocked before app startup by a workspace path access error in the local Next compiler.
- Product image upload and Storage policies remain deferred.
- Phase 1 remains **PASS WITH LIMITATIONS**; Customer B's live verification is still deferred and is not changed by this phase.
- No Phase 3 tables or functionality were introduced.

Detailed sanitized command results: [`docs/evidence/phase-2/hosted-verification.txt`](../evidence/phase-2/hosted-verification.txt).
