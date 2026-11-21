# Phase 2 — Products and Inventory Architecture

## Scope

This phase adds product categories, the catalogue, current stock balances, an append-only movement ledger, staff-facing product/inventory screens, and related authorization and tests. It does not add sales, sale items, customer-facing catalogue/order flows, reservations, supplier purchasing, payment features, reports, offline business storage, or synchronization. Product images are deferred; `image_path` remains an optional schema field with no upload path.

Phase 1 remains **PASS WITH LIMITATIONS**. Customer B's live UI/session verification is deferred pre-production verification and is tracked in `docs/phase-1/PHASE-1D-REPORT.md`. Phase 2 does not revise that status.

## Schema

All objects are defined in `supabase/migrations/20261012050000_phase2_products_inventory.sql`.

- `categories`: UUID identity, trimmed required name, lowercase slug, active flag, timestamps. Names are unique case-insensitively after trimming; slugs are unique and constrained to lowercase letters, digits, and hyphens. Categories are deactivated, not deleted.
- `products`: required category and name; nullable SKU, barcode, description, cost price, and image path; exact PostgreSQL `NUMERIC` GHS selling/cost prices constrained to at most two fractional digits and below the supported ten-digit whole-unit range; `NUMERIC` reorder quantity constrained to at most three fractional digits. Prices and thresholds cannot be negative. SKU/barcode uniqueness is case-insensitive when populated. Product rows are deactivated rather than deleted.
- `inventory_balances`: one row per product after the first movement, with non-negative `NUMERIC` quantity constrained to three decimal places and the supported nine-digit whole-unit range.
- `stock_movements`: append-only signed `NUMERIC` deltas with the same three-decimal quantity constraint, constrained movement enum, optional reference/reason/client operation ID, server timestamp, actor ID, and actor-name snapshot. Phase 2 accepts `opening_stock`, `receipt`, `wastage`, `damage`, `adjustment_in`, and `adjustment_out`; `sale`, `customer_return`, and `reversal` are reserved for later work and are not accepted by the Phase 2 mutation function.
- `audit_logs`: append records for category/product changes, selling-price changes, and stock movements. No audit UI is included.

Indexes cover case-insensitive SKU and barcode uniqueness and prefix search, product category/active filtering, movement product/date history, and audit entity/date lookups. Product name/SKU/barcode search is prefix-based so the corresponding pattern indexes remain usable.

Sale history does not exist in Phase 2. Phase 3 must snapshot sale-item name/SKU and unit selling price when a sale is written; later catalogue price changes must never rewrite completed sale snapshots.

## Inventory transaction and invariants

All staff stock changes call `record_stock_movement` using their authenticated Supabase session. The function maps movement type to the centralized Phase 1 permission catalog, requires an active staff actor, validates positive quantity (maximum three decimals), locks the product row, and serializes operations for that product. It derives the signed delta from the selected operation, locks/creates the balance row, rejects a negative result, inserts the movement and audit event, and updates the balance in the same database transaction. `client_operation_id` is unique and retries with the same operation payload return the original movement.

Opening stock is allowed only before any movement exists. A second opening balance is rejected; subsequent corrections use reasoned adjustments. Receipts may omit a note; wastage, damage, and both adjustment directions require a reason. Time is assigned by PostgreSQL, not by a browser-supplied timestamp.

Authenticated clients have no direct write grants on balances or movements. Movement updates/deletes are rejected by a database trigger. A deferred constraint trigger verifies at transaction end that each balance equals the sum of all its movements, so a failed or unpaired change rolls back.

The product-row `FOR UPDATE` lock prevents two simultaneous operations on the same product from reading and overwriting a stale quantity. Hosted concurrency evidence is retained separately from this design statement; do not treat the lock alone as a concurrency test result.

## Stock status

`lib/inventory/stock-status.ts` centralizes UI status labels and threshold comparisons. Inactive products show `Inactive`; active quantity at or below zero is `Out of stock`; positive quantity at or below reorder level is `Low stock`; quantity above the threshold is `In stock`. The database summary uses the same documented comparisons for totals. Quantities display with up to three decimals and GHS prices with exactly two.

## Permissions and RLS

The migration extends `permissions`/`role_permissions`:

| Permission                      | Admin | Manager | Cashier | Stock assistant |
| ------------------------------- | ----: | ------: | ------: | --------------: |
| View products and current stock |   Yes |     Yes |     Yes |             Yes |
| Manage categories/products      |   Yes |     Yes |      No |              No |
| Initialize opening stock        |   Yes |     Yes |      No |              No |
| Receive stock                   |   Yes |     Yes |      No |             Yes |
| Record wastage/damage           |   Yes |     Yes |      No |             Yes |
| Reasoned adjustments in/out     |   Yes |     Yes |      No |             Yes |
| View movement history           |   Yes |     Yes |      No |             Yes |

Customers and anonymous users have none of these permissions. RLS protects all five Phase 2 tables. Product/category reads and management are permission-filtered. Balances are readable to staff with Phase 1 `view_inventory`; only movement-history permission can read the ledger. Audit rows are readable only through Phase 1 `view_audit`. Authenticated clients can select, insert, and update permitted catalogue rows; there is no delete grant. Inventory has no client DML grant; the RPC is the only authenticated mutation path and rechecks authorization inside PostgreSQL. The stock history RPC checks `view_stock_history` before exposing the actor-name snapshot.

## Audit

Category/product triggers record creation, changed fields, and deactivation. Selling price changes get a separate event with old/new exact numeric values. A stock-movement trigger records movement kind, signed quantity, reason, and reference in the same transaction. `actor_name` is snapshotted on each movement so historic attribution remains readable if a development test identity is later removed; the optional Auth foreign key is set null on account deletion.

## UI and routes

- `/products`: search by name/SKU/barcode prefix; category/active filters; paginated catalogue; category and product creation for managers/admins.
- `/products/[productId]/edit`: product changes and activate/deactivate for managers/admins.
- `/inventory`: stock summary, current balances/status, and permitted movement form. Operation-specific positive quantities avoid ambiguous signed input.
- `/stock-movements`: authorized, product-filterable movement history with Accra-local time, actor, reason, and reference.
- `/staff`: links to the Phase 2 tools. Staff route-group layout protects all these pages.

Only staff screens are added. Customer catalogue, POS, sales, reservations, supplier purchasing, offline storage, and dashboard/report UI remain out of scope.

## Seed data

`supabase/seed.sql` contains clearly labeled fictional development categories and products, inserted idempotently after local `supabase db reset`. `supabase db push` does not apply seed rows to the hosted project. Seed data does not contain real customer records and does not create opening stock.

## Verification

- Unit tests cover category/product/stock-operation validation, decimal string normalization, and stock-status boundaries.
- `supabase/tests/phase2_products_inventory.test.sql` covers schema/RLS, customer/cashier restrictions, stock assistant/manager/admin permissions, each Phase 2 movement, negative-stock/precision/reason rejections, ledger equality, and price/movement audit events in a rollback transaction.
- Playwright coverage is opt-in for hosted staff credentials (`PHASE2_LIVE=1`); any retained movement fixtures are deactivated rather than deleted, preserving the append-only record.
- Before hosted apply, confirm the linked ref is the GrandPa development ref and run `supabase db push --dry-run --linked`. Apply only the committed migration and verify schema/RLS against that development target. Never create application schema manually in Studio.
- Store actual command and hosted SQL output under `docs/evidence/phase-2/`; do not create fabricated screenshots or include secrets.

### Phase 2 run results (2026-10-12)

- GrandPa development ref `xjzdcpuwrjnpjzntytjs` is linked; all five local migrations match the hosted migration history, including the actor-redaction fix.
- Hosted schema verification found all five Phase 2 tables with RLS enabled, no direct authenticated inventory writes, no anonymous balance reads, and no Phase 3 tables. Hosted schema lint reported no errors.
- The hosted Phase 2 pgTAP script completed with plan `1..67`. The local Phase 1/2 suite had previously completed with 95 assertions.
- Hosted concurrency verification passed: two overlapping authenticated receipts produced the expected `100.375` balance and matching three-row ledger. The temporary staff identity was removed.
- The opt-in hosted Playwright run reached and passed the catalogue, stock movement, staff-role, customer, and anonymous RLS assertions once, but that run failed during cleanup because the append-only movement trigger blocked the `ON DELETE SET NULL` actor foreign key. Migration `20261012060000_allow_stock_actor_redaction.sql` now permits only that FK-driven redaction while preserving the actor-name snapshot and rejecting all other movement changes/deletes.
- After the fix, the hosted concurrency run and cleanup passed. A later diagnostic browser run passed identity setup, manager UI sign-in, category/product creation, and product edit-page loading. The product edit Server Action POST returned HTTP 200 but its React action state remained pending with no browser console/page error. The server-side action outcome was not captured, so the cause is undetermined. A further retry could not start because the local Next compiler was denied workspace path access. Hosted live E2E remains **inconclusive**, not a passing final run. See `docs/evidence/phase-2/hosted-verification.txt`.
- Standard E2E regression: 8 passed, 4 skipped (including the opt-in Phase 2 hosted scenario). Lint, typecheck, formatting, unit tests, build, and `git diff --check` passed.

## Limitations

Image upload and Storage bucket policy are deferred because core catalogue/inventory correctness does not depend on them. The hosted live browser journey needs one stable passing rerun before Phase 3 is marked ready. Phase 1's accepted Customer B limitation remains unchanged.
