# Phase 3 — Customers & Point of Sale

## Scope

Phase 3 adds staff customer management and online point-of-sale transactions. It does not add customer credit, orders, reservations, payment-provider processing, offline sales, IndexedDB business data, synchronization, analytics, or an audit browser.

## Customer operations

The existing Phase 1 `customers` identity/profile table remains the customer foundation. Walk-in records have nullable `auth_user_id`; cashier quick-create does not create an Auth account. Ghana phone numbers continue to be normalized to E.164 form. Search supports name, phone, and email, and potential duplicate phone/email matches are shown as warnings. Staff can update permitted fields and deactivate/reactivate records. Sales use `ON DELETE RESTRICT`, so referenced customer history is retained.

Database triggers normalize staff/customer phones and audit customer creation and updates. Trigger wrappers execute with the required database privileges; helper functions remain unavailable to direct API roles.

## Sales and payments

`sales` stores the sale UUID, unique human-readable receipt number, optional customer, cashier, POS channel, status, numeric subtotal/total, operation ID, and timestamps. `sale_items` stores product/name/SKU/price/quantity/line-total snapshots. `payments` stores the one sale payment, method/status/amount, optional external reference, recorder, and timestamps. The enum reserves `paystack` and `credit`; neither can be used to complete Phase 3 sales. Status values reserve `voided` and `reversed`, but correction controls are not implemented. Completed records are immutable to ordinary roles.

Authoritative amounts use PostgreSQL `numeric`. The database obtains the current product price, validates a positive quantity to three decimal places, rounds line totals to cents, and computes the sale total. Browser totals are estimates only.

## Transaction and inventory boundary

`complete_pos_sale` is the sole sale-completion operation. It checks the authenticated active admin/manager/cashier permission, validates active products and any active linked customer, locks products and inventory balances, recalculates prices and totals, then inserts the sale, snapshots, payment, sale-linked negative stock movements, balance changes, and audit events in the same transaction. An exception rolls the entire operation back. Stock below zero is rejected. `(cashier_user_id, client_operation_id)` and payment operation constraints prevent retries from creating duplicate transactions; the client disables repeat submission while in flight.

The hosted concurrency test starts two four-unit sales against stock of five. Exactly one completes; the remaining balance is one and the movement ledger also sums to one.

## Receipt numbering decision

Phase 3 receipts use `GP-YYMMDD-<16 uppercase hex characters>`, with the date from the server in `Africa/Accra` and entropy derived from the UUID client operation ID. The unique database constraint is authoritative. If the short daily candidate already exists, the function appends another operation-ID suffix. Receipt numbers are labels, not primary keys. See [ADR-003](../adr/ADR-003-receipt-numbering.md).

Phase 3 allocates the receipt online when the sale commits. Offline sale creation and local receipt issuance remain out of scope. Retaining a client-generated UUID operation ID gives a future offline/sync design a stable uniqueness seed; Phase 6 must define device-local provisional receipts and conflict/reconciliation rules before offline sales are enabled.

## Access control

The centralized permission system grants sale completion to admin, manager, and cashier. Stock Assistant and Customer do not receive that permission. Sales/items/payments have RLS enabled; reads require sales-history permission and cashiers are scoped to their own sales, while managers/admins have permitted broader history. Writes are revoked from ordinary API roles and flow through controlled database functions. Customers cannot read POS sales or create a POS sale. Customer browser login/staff-route live verification remains deferred with the Phase 1 customer-auth limitation; the Phase 3 hosted tests directly verify customer RLS/RPC denial and anonymous POS redirect.

Customer management/search, sales history, receipt detail, and sale completion are permission-checked on the server/database. Cashiers can complete sales and create/search customers but cannot mutate completed transactions or create payments directly.

## UI

- `/customers` and `/customers/[customerId]/edit`: staff search, create, permitted edits, and status changes.
- `/pos`: keyboard-friendly product name/SKU/barcode lookup, cart, 3-decimal quantities, optional customer, cash or “Externally Confirmed Mobile Money,” and submission state.
- `/sales` and `/sales/[saleId]`: permitted sales history and immutable receipt detail/print view.

MoMo references are cashier-entered only. The interface states that the cashier confirmed the transfer externally; no automatic provider verification is claimed.

## Database changes

All Phase 3 schema changes are migrations:

- `20261012070000_phase3_customers_pos_sales.sql`
- `20261012071000_phase3_customer_guard_and_sale_immutability.sql`
- `20261012072000_phase3_sale_rpc_lock_and_receipt_fix.sql`
- `20261012073000_secure_phone_normalization_trigger.sql`
- `20261012074000_definer_phone_triggers.sql`

The target was linked GrandPa development project `xjzdcpuwrjnpjzntytjs`; local and hosted migration versions matched through `20261012074000`. No application tables were created manually in the dashboard.

## Verification

- Phase 3 hosted pgTAP: 48 assertions passed, including customer rules, pricing, decimal quantities, atomic rollback, idempotency, immutability, audit, RLS, payment, stock movement, and balance/ledger reconciliation.
- Phase 2 hosted inventory regression: 67 assertions passed.
- Hosted E2E: two consecutive serialized passes; sanitized traces and receipt screenshots are under `docs/evidence/phase-3/`.
- Regression: lint, typecheck, format check, unit tests, standard E2E, production build, and `git diff --check` passed. Standard E2E reports 8 passed and 5 opt-in hosted suites skipped; Phase 3 hosted E2E was separately run twice with `PHASE3_LIVE=1`.

## Limitations and deferred items

- Phase 1 Customer B live UI/session verification remains deferred.
- Phase 2 product image upload remains deferred.
- Phase 3 customer browser login and authenticated customer staff-route redirect were not included in the passing E2E pair because the test customer login action hung. Customer RLS/RPC denial passed against the hosted project. This is tracked with, and does not close, the existing Phase 1 customer-auth limitation.
- Void/reversal operations, refunds, credit, offline receipts/sales, provider verification, and reporting remain future work.
- Phase 3 is online-only. No IndexedDB business storage, sync queue, or offline sales were added.
