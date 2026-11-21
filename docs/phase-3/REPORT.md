# Phase 3 — Customers & Point of Sale Report

**Status:** PASS WITH LIMITATIONS<br>
**Ready for Phase 4:** YES, with the documented Phase 1 customer-auth verification limitation still open.

## Implemented

- Staff customer create/search/view/edit/activate/deactivate, quick walk-in creation, Ghana phone normalization, and duplicate warnings.
- Staff POS with keyboard product lookup (name, SKU, barcode), 3-decimal cart quantity, optional customer, cash, externally confirmed MoMo, in-flight duplicate-submit guard, receipt, and sales history/detail.
- Transactional server-side sale completion with authoritative prices, exact numeric calculations, stock locks, stock movements, audit records, idempotency, and rollback.
- RLS and centralized permissions for customer, cashier, manager/admin, Stock Assistant, and anonymous access.

## Database

Five migrations from `20261012070000` through `20261012074000` are applied to GrandPa development and synced with local migration history. Tables: `sales`, `sale_items`, `payments`; enums: `sale_channel`, `sale_status`, `payment_method`, `payment_status`; main functions include `search_customers`, `complete_pos_sale`, `get_pos_sale`, and `search_pos_sales`. The initial migration added customer audit events and operational search indexes. No dashboard-created application schema was used.

## Acceptance summary

- Customer staff management/search, customer without Auth, Ghana normalization, duplicate warning: PASS.
- Cash one/multi-item decimal sale and externally confirmed MoMo: PASS.
- Database pricing, item snapshots, payment, receipt number, immutable completed transaction: PASS.
- Sale/items/payment/stock movements/audit are atomic; insufficient-stock rollback: PASS.
- Inventory balance reconciles to the movement ledger; concurrent sales from stock five allow exactly one of two four-unit attempts: PASS.
- Hosted browser evidence recorded cash receipt `GP-261012-CC27F1440BC04B13` at GHS 18.51 and MoMo receipt `GP-261012-41173E0EF0EC40AE` at GHS 6.17. Stock ended at eight after these two sales; the concurrency check ended at one with the movement ledger also totaling one.
- Cashier sales history is scoped; manager can see permitted broader history; Customer, Stock Assistant, and anonymous cannot create sales or read internal sales: PASS at hosted database/RPC boundary.
- Cashier can complete a sale and create/search customers; Stock Assistant sale completion denied: PASS.
- Receipt printing/history and externally confirmed MoMo wording: PASS.

## Verification results

- Phase 3 hosted SQL: 48/48 assertions passed.
- Phase 2 inventory hosted regression: 67 assertions passed.
- Phase 3 hosted Playwright: two consecutive serialized runs passed.
- Regression: lint, typecheck, formatting, 33 unit tests, 8 standard browser tests, production build, and diff check passed. Standard E2E skipped five opt-in tests; the Phase 3 hosted E2E was run explicitly twice.

## Limitations

- Phase 1 Customer B live UI/session verification remains deferred.
- Phase 2 product image upload remains deferred.
- Customer browser login and authenticated customer staff-route denial are not claimed by the Phase 3 E2E pair. The test customer login action hung; hosted customer RLS/RPC denial and anonymous POS redirect passed. Keep this with the Phase 1 auth limitation for later closure.
- No customer credit, order workflow, stock reservation, Paystack, offline business stores/sales, synchronization, void/reversal controls, or reporting were added.
- Receipt numbers are issued on online commit. Offline provisional receipt conflict behavior needs a later decision before offline sales are implemented.

## Evidence

See [`docs/evidence/phase-3/hosted-verification.md`](../evidence/phase-3/hosted-verification.md) and the sanitized two-run traces and receipt screenshots in the same directory.
